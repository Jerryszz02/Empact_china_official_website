#!/usr/bin/python3 -I
"""Restricted SSH entrypoint: accept one approved GitHub artifact and release it.

Install root-owned and allow sudo with no command-line arguments. The SSH key's
forced command must invoke this file; it never evaluates SSH_ORIGINAL_COMMAND.
"""
import fcntl
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import ssl
import stat
import subprocess
import sys
import threading
import time
from datetime import datetime
from urllib.parse import urlsplit

ROOT = Path("/srv/empact")
STAGING = ROOT / "staging"
MIN_FREE_BYTES = 3 * 1024 ** 3
MIN_FREE_INODES = 150000
PRUNE = Path("/usr/local/lib/empact/prune-build-cache.py")
UPLOAD_BUDGET_SECONDS = 60 * 60
PROGRESS_INTERVAL_BYTES = 32 * 1024 * 1024
DOWNLOAD_WORKERS = 8
RANGE_CHUNK_BYTES = 256 * 1024
SOCKET_TIMEOUT_SECONDS = 15
RESUME_CHECKPOINT_BYTES = 2 * 1024 * 1024
RESUME_DATA = ".artifact-resume.data"
RESUME_STATE = ".artifact-resume.json"
RESUME_TEMP = ".artifact-resume.json.tmp"


class RangeError(ValueError):
    pass


class ProtocolError(RangeError):
    pass


class DownloadStatusError(RangeError):
    """A temporary or authorization HTTP response; keep verified ranges."""


def _load(name, alias):
    spec = importlib.util.spec_from_file_location(alias, Path(__file__).with_name(name))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gate = _load("auto-update.py", "empact_auto_update")
runtime = _load("runtime-artifact.py", "empact_runtime_artifact")


def read_sha(stream):
    value = stream.readline(42)
    if not re.fullmatch(r"[0-9a-f]{40}\n", value):
        raise ValueError("expected exactly one full lowercase commit SHA and newline")
    return value.rstrip("\n")


def read_request(stream):
    line = stream.readline(257)
    if not line.endswith(b"\n") or len(line) > 256:
        raise ValueError("expected a short JSON deployment request")

    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate deployment request key")
            result[key] = value
        return result

    try:
        request = json.loads(line.decode("ascii"), object_pairs_hook=unique_object)
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError("invalid deployment request") from error
    if (not isinstance(request, dict) or
            set(request) not in ({"sha", "artifactId"}, {"sha", "artifactId", "transport"},
                                 {"sha", "artifactId", "dependencyArtifactId", "transport"}) or
            not isinstance(request["sha"], str) or not gate.SHA_RE.fullmatch(request["sha"]) or
            not isinstance(request["artifactId"], int) or isinstance(request["artifactId"], bool) or
            request["artifactId"] < 1 or
            ("dependencyArtifactId" in request and
             (request["transport"] != "https-layers" or
              not isinstance(request["dependencyArtifactId"], int) or
              isinstance(request["dependencyArtifactId"], bool) or
              request["dependencyArtifactId"] < 1 or
              request["dependencyArtifactId"] == request["artifactId"])) or
            ("dependencyArtifactId" not in request and "transport" in request and
             request["transport"] != "https")):
        raise ValueError("deployment request accepts only a SHA and artifact ID")
    return request


def read_download_url(stream, require_eof=True):
    line = stream.readline(8194)
    if not line.endswith(b"\n") or len(line) > 8193:
        raise ValueError("invalid artifact download URL line")
    if require_eof and stream.read(1):
        raise ValueError("artifact download URL has trailing input")
    try:
        url = line[:-1].decode("ascii")
    except UnicodeError:
        raise ValueError("invalid artifact download URL")
    return runtime.validate_download_url(url)


def approved_metadata(sha, artifact_id, kind="runtime", run=None):
    if run is None:
        gate.start_gate(sha, gate.current_revision(ROOT / "code/current"))
        run = gate.approved_run(sha)
    artifact = gate.github_json("/repos/{}/actions/artifacts/{}".format(gate.REPOSITORY, artifact_id))
    if kind == "runtime":
        return runtime.validate_artifact(sha, artifact_id, artifact, run, gate.REPOSITORY)
    return runtime.validate_artifact(sha, artifact_id, artifact, run, gate.REPOSITORY, kind=kind)


def check_capacity(root, incoming_size):
    usage = os.statvfs(str(root))
    if (usage.f_bavail * usage.f_frsize < MIN_FREE_BYTES + incoming_size or
            usage.f_favail < MIN_FREE_INODES):
        raise ValueError("insufficient disk headroom for artifact reception and deployment")


def upload_log(message):
    # SSH may disconnect while the trusted receiver still needs to remove its
    # partial archive. Diagnostics must never interrupt that cleanup.
    try:
        print(message, file=sys.stderr, flush=True)
    except (OSError, ValueError):
        pass


def stage_artifact(sha, metadata, stream, staging=STAGING):
    staging = Path(staging)
    if staging.is_symlink() or not staging.is_dir() or os.stat(str(staging)).st_uid != 0:
        raise ValueError("trusted staging directory missing")
    final_zip = staging / ("artifact-" + sha + ".zip")
    final_metadata = staging / ("artifact-" + sha + ".json")
    temporary = staging / (".artifact-" + sha + "." + str(os.getpid()) + ".tmp")
    for path in (final_zip, final_metadata, temporary):
        if path.exists() or path.is_symlink():
            raise ValueError("artifact staging path already exists")
    digest = hashlib.sha256()
    expected_size = metadata["size"]
    remaining = expected_size
    received = 0
    next_report = PROGRESS_INTERVAL_BYTES
    started = time.monotonic()
    installed_zip = False
    try:
        upload_log("Receiving artifact: 0/{} bytes".format(expected_size))
        descriptor = os.open(str(temporary), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as output:
            while remaining:
                chunk = stream.read(min(1024 * 1024, remaining))
                if not chunk:
                    raise ValueError("short artifact upload")
                output.write(chunk)
                received += len(chunk)
                remaining -= len(chunk)
                digest.update(chunk)
                if received >= next_report:
                    upload_log("Artifact received: {}/{} bytes in {:.1f}s".format(
                        received, expected_size, time.monotonic() - started))
                    next_report += PROGRESS_INTERVAL_BYTES
            upload_log("Artifact received: {}/{} bytes in {:.1f}s; awaiting input EOF".format(
                received, expected_size, time.monotonic() - started))
            if stream.read(1):
                raise ValueError("artifact upload has trailing bytes")
            output.flush()
            os.fsync(output.fileno())
        if "sha256:" + digest.hexdigest() != metadata["expectedDigest"]:
            raise ValueError("artifact upload digest mismatch")
        os.replace(str(temporary), str(final_zip))
        installed_zip = True
        with open(str(final_metadata), "x") as output:
            json.dump(metadata, output, sort_keys=True)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(str(final_metadata), 0o600)
        return final_zip
    except BaseException:
        upload_log("Artifact reception failed after {}/{} bytes in {:.1f}s".format(
            received, expected_size, time.monotonic() - started))
        if temporary.exists():
            temporary.unlink()
        if installed_zip:
            final_zip.unlink()
        if final_metadata.exists() and not final_metadata.is_symlink():
            final_metadata.unlink()
        raise


def _trusted_staging(staging):
    staging = Path(staging)
    if staging.is_symlink() or not staging.is_dir() or os.stat(str(staging)).st_uid != 0:
        raise ValueError("trusted staging directory missing")
    return staging


def _cache_info(path):
    try:
        info = path.lstat()
    except FileNotFoundError:
        return None
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or
            stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
        raise ValueError("untrusted artifact resume cache path")
    return info


def _cache_paths(staging):
    return (staging / RESUME_DATA, staging / RESUME_STATE, staging / RESUME_TEMP)


def _clear_resume(staging):
    paths = _cache_paths(staging)
    # Validate every fixed path before removing any of them. An unexpected
    # symlink, directory or hardlink must never become a cleanup target.
    present = [path for path in paths if _cache_info(path) is not None]
    for path in present:
        path.unlink()


def _save_resume(staging, state):
    _, saved, temporary = _cache_paths(staging)
    if _cache_info(temporary) is not None:
        temporary.unlink()  # A previous interrupted atomic write.
    encoded = (json.dumps(state, sort_keys=True, separators=(",", ":")) + "\n").encode("ascii")
    descriptor = os.open(str(temporary), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        os.fchmod(descriptor, 0o600)
        while encoded:
            written = os.write(descriptor, encoded)
            if written <= 0:
                raise OSError("resume state write failed")
            encoded = encoded[written:]
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    os.replace(str(temporary), str(saved))
    if sys.platform.startswith("linux"):
        directory = os.open(str(staging), os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)


def _ranges(size):
    workers = min(DOWNLOAD_WORKERS, size)
    return [(index * size // workers, (index + 1) * size // workers - 1)
            for index in range(workers)]


def _resume_identity(sha, metadata):
    size = metadata.get("size")
    artifact_id = metadata.get("artifactId")
    digest = metadata.get("expectedDigest")
    if (metadata.get("sha") != sha or not isinstance(size, int) or isinstance(size, bool) or
            not 0 < size <= runtime.MAX_ZIP_BYTES or
            not isinstance(artifact_id, int) or isinstance(artifact_id, bool) or artifact_id < 1 or
            not isinstance(digest, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", digest)):
        raise ValueError("invalid approved artifact metadata")
    return {"format": 1, "sha": sha, "artifactId": artifact_id,
            "size": size, "expectedDigest": digest}


def _open_resume(sha, metadata, staging):
    staging = _trusted_staging(staging)
    identity = _resume_identity(sha, metadata)
    size = identity["size"]
    data_path, state_path, temporary = _cache_paths(staging)
    data_info = _cache_info(data_path)
    state_info = _cache_info(state_path)
    _cache_info(temporary)
    ranges = _ranges(size)
    if data_info is not None and state_info is not None:
        try:
            if state_info.st_size > 16384:
                raise ValueError("resume state too large")
            state = json.loads(state_path.read_text())
            if (not isinstance(state, dict) or
                    any(state.get(key) != value for key, value in identity.items()) or
                    set(state) != set(identity) | {"offsets", "hashes"} or
                    not isinstance(state.get("offsets"), list) or
                    not isinstance(state.get("hashes"), list) or
                    len(state["offsets"]) != len(ranges) or len(state["hashes"]) != len(ranges) or
                    data_info.st_size != size):
                raise ValueError("resume identity or size changed")
            descriptor = os.open(str(data_path), os.O_RDWR | os.O_NOFOLLOW)
            opened = os.fstat(descriptor)
            if (opened.st_dev, opened.st_ino) != (data_info.st_dev, data_info.st_ino):
                raise ValueError("resume file changed")
            hashers = []
            for index, (start, end) in enumerate(ranges):
                offset = state["offsets"][index]
                expected_hash = state["hashes"][index]
                if (not isinstance(offset, int) or isinstance(offset, bool) or
                        not 0 <= offset <= end - start + 1 or
                        not isinstance(expected_hash, str) or
                        not re.fullmatch(r"[0-9a-f]{64}", expected_hash)):
                    raise ValueError("invalid resume checkpoint")
                digest = hashlib.sha256()
                position = 0
                while position < offset:
                    chunk = os.pread(descriptor, min(1024 * 1024, offset - position), start + position)
                    if not chunk:
                        raise ValueError("short resume checkpoint")
                    digest.update(chunk)
                    position += len(chunk)
                if digest.hexdigest() != expected_hash:
                    raise ValueError("resume checkpoint digest mismatch")
                hashers.append(digest)
            return descriptor, state, hashers, ranges
        except (OSError, ValueError, TypeError, KeyError, UnicodeError):
            if "descriptor" in locals():
                os.close(descriptor)
            _clear_resume(staging)
    elif data_info is not None or state_info is not None:
        _clear_resume(staging)
    if _cache_info(temporary) is not None:
        temporary.unlink()
    descriptor = os.open(str(data_path), os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        os.fchmod(descriptor, 0o600)
        os.ftruncate(descriptor, size)  # Sparse file; only verified prefixes consume disk.
        os.fsync(descriptor)
        state = dict(identity)
        state["offsets"] = [0] * len(ranges)
        state["hashes"] = [hashlib.sha256(b"").hexdigest()] * len(ranges)
        _save_resume(staging, state)
        return descriptor, state, [hashlib.sha256() for _ in ranges], ranges
    except BaseException:
        os.close(descriptor)
        _clear_resume(staging)
        raise


def resume_remaining(sha, metadata, staging=STAGING):
    descriptor, state, _, _ = _open_resume(sha, metadata, staging)
    os.close(descriptor)
    return metadata["size"] - sum(state["offsets"])


def stage_https_artifact(sha, metadata, url, staging=STAGING):
    """Resume eight verified HTTPS ranges, then verify the complete ZIP."""
    url = runtime.validate_download_url(url)
    staging = _trusted_staging(staging)
    final_zip = staging / ("artifact-" + sha + ".zip")
    final_metadata = staging / ("artifact-" + sha + ".json")
    for path in (final_zip, final_metadata):
        if path.exists() or path.is_symlink():
            raise ValueError("artifact staging path already exists")
    parsed = urlsplit(url)
    target = parsed.path + "?" + parsed.query
    started = time.monotonic()
    deadline = started + UPLOAD_BUDGET_SECONDS
    descriptor, state, hashers, ranges = _open_resume(sha, metadata, staging)
    progress = {"received": sum(state["offsets"]),
                "next": (sum(state["offsets"]) // PROGRESS_INTERVAL_BYTES + 1) * PROGRESS_INTERVAL_BYTES}
    state_lock = threading.Lock()
    stopped = threading.Event()
    unsafe = threading.Event()
    installed_zip = False
    data_path, _, _ = _cache_paths(staging)

    def checkpoint(index, offset, digest):
        with state_lock:
            if offset <= state["offsets"][index]:
                return
            os.fsync(descriptor)
            state["offsets"][index] = offset
            state["hashes"][index] = digest.hexdigest()
            _save_resume(staging, state)

    def download_range(index, start, end):
        confirmed = state["offsets"][index]
        received = confirmed
        digest = hashers[index].copy()
        connection = None
        try:
            if received == end - start + 1:
                return 0
            if stopped.is_set() or time.monotonic() >= deadline:
                raise TimeoutError("deadline")
            connection = http.client.HTTPSConnection(
                parsed.hostname, port=443,
                timeout=min(SOCKET_TIMEOUT_SECONDS, max(1, deadline - time.monotonic())),
                context=ssl.create_default_context())
            connection.request("GET", target, headers={
                "Range": "bytes={}-{}".format(start + received, end),
                "Accept-Encoding": "identity", "Connection": "close",
            })
            response = connection.getresponse()
            if response.status != 206:
                if response.status in (401, 403, 429) or response.status >= 500:
                    raise DownloadStatusError("HTTP status {}".format(response.status))
                raise ProtocolError("HTTP status {}".format(response.status))
            content_range = response.getheader("Content-Range") or ""
            match = re.fullmatch(r"bytes ([0-9]+)-([0-9]+)/([0-9]+)", content_range)
            if (not match or (int(match.group(1)), int(match.group(2)), int(match.group(3))) !=
                    (start + received, end, metadata["size"])):
                raise ProtocolError("invalid Content-Range")
            length = response.getheader("Content-Length")
            if length != str(end - start + 1 - received) or response.getheader("Content-Encoding") not in (None, "identity"):
                raise ProtocolError("invalid range length or encoding")
            while received < end - start + 1:
                if stopped.is_set() or time.monotonic() >= deadline:
                    raise TimeoutError("deadline")
                chunk = response.read1(min(RANGE_CHUNK_BYTES, end - start + 1 - received))
                if not chunk:
                    raise RangeError("short range")
                if len(chunk) > end - start + 1 - received:
                    raise ProtocolError("overlong range")
                amount = len(chunk)
                payload = chunk
                position = start + received
                while chunk:
                    written = os.pwrite(descriptor, chunk, position)
                    if written <= 0:
                        raise OSError("range write failed")
                    position += written
                    chunk = chunk[written:]
                digest.update(payload)
                received += amount
                with state_lock:
                    progress["received"] += amount
                    if progress["received"] >= progress["next"]:
                        upload_log("Artifact received: {}/{} bytes in {:.1f}s".format(
                            progress["received"], metadata["size"], time.monotonic() - started))
                        progress["next"] += PROGRESS_INTERVAL_BYTES
                if received - state["offsets"][index] >= RESUME_CHECKPOINT_BYTES or received == end - start + 1:
                    checkpoint(index, received, digest)
            if response.read1(1):
                raise ProtocolError("overlong range")
            return received - confirmed
        except BaseException as error:
            if isinstance(error, ProtocolError):
                unsafe.set()
            stopped.set()
            if not unsafe.is_set() and received > state["offsets"][index]:
                try:
                    checkpoint(index, received, digest)
                except BaseException:
                    pass
            reason = str(error) if isinstance(error, RangeError) else type(error).__name__
            raise ValueError("artifact range failed: {} after {} bytes".format(reason, received - confirmed)) from None
        finally:
            if connection is not None:
                connection.close()

    try:
        upload_log("Receiving artifact: {}/{} verified bytes".format(progress["received"], metadata["size"]))
        executor = ThreadPoolExecutor(max_workers=len(ranges))
        try:
            futures = [executor.submit(download_range, index, start, end)
                       for index, (start, end) in enumerate(ranges) if state["offsets"][index] < end - start + 1]
            for future in as_completed(futures):
                future.result()
        finally:
            stopped.set()
            executor.shutdown(wait=True)
        if sum(state["offsets"]) != metadata["size"] or os.fstat(descriptor).st_size != metadata["size"]:
            raise ValueError("artifact range total mismatch")
        os.fsync(descriptor)
        digest = hashlib.sha256()
        with open(str(data_path), "rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        if "sha256:" + digest.hexdigest() != metadata["expectedDigest"]:
            unsafe.set()
            raise ValueError("artifact download digest mismatch")
        os.close(descriptor)
        descriptor = None
        os.replace(str(data_path), str(final_zip))
        installed_zip = True
        with open(str(final_metadata), "x") as output:
            json.dump(metadata, output, sort_keys=True)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(str(final_metadata), 0o600)
        try:
            _clear_resume(staging)
        except OSError:
            upload_log("Artifact committed; resume-state cleanup needs attention")
        upload_log("Artifact received: {}/{} bytes in {:.1f}s".format(
            metadata["size"], metadata["size"], time.monotonic() - started))
        return final_zip
    except BaseException:
        stopped.set()
        upload_log("Artifact reception failed; retained {}/{} verified bytes".format(
            sum(state["offsets"]), metadata["size"]))
        if descriptor is not None:
            os.close(descriptor)
        if unsafe.is_set():
            _clear_resume(staging)
        if installed_zip and final_zip.exists():
            try:
                os.replace(str(final_zip), str(data_path))
            except OSError:
                final_zip.unlink()
        if final_metadata.exists() and not final_metadata.is_symlink():
            final_metadata.unlink()
        raise

def dependency_transfer_staging(staging=STAGING):
    """Own only the private transfer directory and recognized old artifacts."""
    staging = _trusted_staging(staging)
    transfer = staging / "dependency-transfer"
    if not transfer.exists() and not transfer.is_symlink():
        transfer.mkdir(mode=0o700)
        transfer.chmod(0o700)
    info = transfer.lstat()
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or
            stat.S_IMODE(info.st_mode) != 0o700):
        raise ValueError("untrusted dependency transfer directory")
    old_artifacts = []
    for path in transfer.iterdir():
        if path.name in (RESUME_DATA, RESUME_STATE, RESUME_TEMP):
            _cache_info(path)
        elif re.fullmatch(r"artifact-[0-9a-f]{40}\.(zip|json)", path.name):
            _cache_info(path)
            old_artifacts.append(path)
        else:
            raise ValueError("unknown dependency transfer contents")
    for path in old_artifacts:
        _cache_info(path)
        path.unlink()
    return transfer


def prepare_artifact(request, stream, deploy_lock):
    sha = request["sha"]
    layered = request.get("transport") == "https-layers"
    if layered:
        gate.start_gate(sha, gate.current_revision(ROOT / "code/current"))
        run = gate.approved_run(sha)
        metadata = approved_metadata(sha, request["artifactId"], run=run)
        dependency_metadata = approved_metadata(
            sha, request["dependencyArtifactId"], kind="dependencies", run=run)
    else:
        metadata = approved_metadata(sha, request["artifactId"])
    # A retired rollback and abandoned candidate are removed while both locks
    # are held, before the ZIP consumes any server storage.
    subprocess.run([str(PRUNE), sha, "--phase", "prepare", "--discard-candidate",
                    "--apply", "--lock-fd", str(deploy_lock.fileno())],
                   pass_fds=(deploy_lock.fileno(),), check=True,
                   stdout=sys.stderr if request.get("transport") in ("https", "https-layers") else None)
    if layered:
        check_capacity(ROOT, resume_remaining(sha, metadata, STAGING))
        print("EMPACT_ARTIFACT_READY {} {}".format(sha, request["artifactId"]), flush=True)
        application = stage_https_artifact(sha, metadata, read_download_url(stream, require_eof=False), STAGING)
        descriptor = runtime.application_manifest(sha, STAGING)["dependencies"]
        runtime.prune_dependencies(ROOT, incoming=descriptor)
        if runtime.cached_dependencies(descriptor) is None:
            transfer = dependency_transfer_staging(STAGING)
            check_capacity(ROOT, resume_remaining(sha, dependency_metadata, transfer))
            print("EMPACT_ARTIFACT_READY {} {}".format(sha, request["dependencyArtifactId"]), flush=True)
            archive = stage_https_artifact(
                sha, dependency_metadata, read_download_url(stream, require_eof=False), transfer)
            runtime.install_dependencies(sha, descriptor, transfer)
            archive.unlink()
            (transfer / ("artifact-" + sha + ".json")).unlink()
        else:
            upload_log("Verified dependency cache hit; transfer skipped")
        print("EMPACT_ARTIFACTS_COMPLETE {}".format(sha), flush=True)
        if stream.read(1):
            raise ValueError("artifact download URLs have trailing input")
        return application
    if request.get("transport") == "https":
        check_capacity(ROOT, resume_remaining(sha, metadata))
        print("EMPACT_ARTIFACT_READY {} {}".format(sha, request["artifactId"]), flush=True)
        return stage_https_artifact(sha, metadata, read_download_url(stream))
    check_capacity(ROOT, metadata["size"])
    return stage_artifact(sha, metadata, stream)


def upload_timeout(signum, frame):
    raise TimeoutError("artifact upload timed out after {} seconds".format(UPLOAD_BUDGET_SECONDS))


def upload_interrupted(signum, frame):
    raise TimeoutError("artifact reception interrupted")


def deploy(sha):
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("invalid deployment SHA")
    unit = "empact-release@{}.service".format(sha)
    state = subprocess.check_output([
        "/usr/bin/systemctl", "show", unit,
        "--property=ActiveState", "--property=SubState",
    ], universal_newlines=True)
    properties = dict(line.split("=", 1) for line in state.splitlines() if "=" in line)
    if properties.get("ActiveState") not in ("inactive", "failed"):
        if properties.get("SubState") != "exited":
            raise ValueError("this revision is still deploying; inspect its unit before retrying")
        # A disconnected prior caller may have left a completed unit retained.
        subprocess.run(["/usr/bin/systemctl", "stop", unit], check=True)
    since = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    print("Starting {}. Server logs follow when the release finishes.".format(unit), flush=True)
    # systemd owns the deployment, so losing this SSH connection cannot kill a
    # release in the middle of switching pointers. Its own timeout still applies.
    started = subprocess.run(["/usr/bin/systemctl", "start", unit])
    subprocess.run([
        "/usr/bin/journalctl", "--unit", unit, "--since", since,
        "--no-pager", "--output=cat",
    ])
    state = subprocess.check_output([
        "/usr/bin/systemctl", "show", unit,
        "--property=Result", "--property=ExecMainStatus",
    ], universal_newlines=True)
    properties = dict(line.split("=", 1) for line in state.splitlines() if "=" in line)
    # RemainAfterExit retains the exact exit status until it has been read here;
    # otherwise systemd can unload a successful unit (including exit 3) first.
    subprocess.run(["/usr/bin/systemctl", "stop", unit], check=True)
    status = properties.get("ExecMainStatus")
    if started.returncode == 0 and properties.get("Result") == "success":
        if status == "3":
            return 3  # Superseded before deployment began, no release occurred.
        if status == "0":
            return 0
    print("Deployment failed: {}".format(properties), file=sys.stderr)
    return 1


def main():
    try:
        if len(sys.argv) != 1:
            raise ValueError("command-line arguments are not accepted")
        if os.geteuid() != 0:
            raise ValueError("restricted deployment entrypoint must run as root")
        signal.signal(signal.SIGALRM, upload_timeout)
        signal.signal(signal.SIGTERM, upload_interrupted)
        signal.alarm(UPLOAD_BUDGET_SECONDS)
        request = read_request(sys.stdin.buffer)
        with open("/run/lock/empact-actions.lock", "w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with open("/run/lock/empact-deploy.lock", "w") as deploy_lock:
                fcntl.flock(deploy_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                prepare_artifact(request, sys.stdin.buffer, deploy_lock)
            signal.alarm(0)
            return deploy(request["sha"])
    except gate.SupersededError as error:
        upload_log(str(error))
        return 3
    except (ValueError, OSError, gate.GateError, subprocess.CalledProcessError) as error:
        upload_log(str(error))
        return 1
    finally:
        signal.alarm(0)


if __name__ == "__main__":
    sys.exit(main())
