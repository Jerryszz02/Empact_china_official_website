#!/usr/bin/python3 -I
"""Retire verified code releases and completed automatic backups under the deploy lock."""
import argparse
import fcntl
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tarfile
import tempfile

SHA = re.compile(r"[0-9a-f]{40}")
AUTO_BACKUP = re.compile(r"auto-([0-9a-f]{40})-([0-9]{8}T[0-9]{6}Z)")
FAILED_RECEIPT = re.compile(r"failed-([0-9]{8}T[0-9]{6}Z)-([0-9a-f]{40})\.json")
BACKUP_FILE = re.compile(r"empact-[0-9]{8}T[0-9]{6}Z\.tar\.gz(?:\.sha256)?")
ARCHIVE = re.compile(r"(?:[0-9a-f]{40}\.tar\.gz|artifact-[0-9a-f]{40}\.(?:zip|json))")
EXTRACT = re.compile(r"(?:[0-9a-f]{40}\.[0-9]+\.tmp|\.[0-9a-f]{40}\.[0-9]+\.tmp)")
UPLOAD_TEMP = re.compile(r"\.artifact-([0-9a-f]{40})\.[0-9]+\.tmp")
LOCK = "/run/lock/empact-deploy.lock"
LINUX = sys.platform.startswith("linux")
MOUNTINFO = Path("/proc/self/mountinfo")


def active_revisions(code, proc):
    pattern = re.compile(re.escape(str(code)) + r"/([0-9a-f]{40})(?=/|\s|\x00|$)")
    active = set()
    for process in proc.iterdir():
        if not process.name.isdigit():
            continue
        try:
            for name in ("cmdline", "maps"):
                active.update(pattern.findall((process / name).read_text(errors="replace")))
            for link in [process / "cwd", process / "exe", *(process / "fd").iterdir()]:
                try:
                    active.update(pattern.findall(os.readlink(str(link))))
                except FileNotFoundError:
                    pass
        except (FileNotFoundError, ProcessLookupError):
            pass  # A process exited during inspection; permission failures stop cleanup.
    return active


def release(code, sha):
    if not isinstance(sha, str) or not SHA.fullmatch(sha):
        raise ValueError("invalid release revision")
    path = code / sha
    marker = path / ".code-revision"
    if path.is_symlink() or not path.is_dir() or marker.is_symlink() or not marker.is_file() or marker.read_text().strip() != sha:
        raise ValueError("unverified release directory: " + sha)
    # Business data belongs outside code. If an older layout placed it inside a
    # release, retain the whole directory for an operator to examine.
    for relative in ("data", ".data", "backups", "media", "uploads", "apps/cms/.data", "apps/cms/media", "public/uploads"):
        if (path / relative).exists() or (path / relative).is_symlink():
            raise ValueError("release contains business data: " + sha)
    if has_mount(path):
        raise ValueError("release contains a mounted directory: " + sha)
    return path


def mount_points():
    if not LINUX:
        return None
    points = set()
    for line in MOUNTINFO.read_bytes().splitlines():
        if b" - " not in line:
            raise ValueError("malformed mountinfo entry")
        fields = line.split(b" - ", 1)[0].split()
        if len(fields) < 6 or not fields[4].startswith(b"/"):
            raise ValueError("malformed mountinfo mount point")
        raw = re.sub(rb"\\([0-7]{3})", lambda match: bytes([int(match.group(1), 8)]), fields[4])
        if b"\\" in raw:
            raise ValueError("malformed mountinfo escape")
        points.add(Path(os.fsdecode(raw)))
    if not points:
        raise ValueError("mountinfo is empty")
    return points


def has_mount(path):
    path = Path(path)
    points = mount_points()
    if points is not None:
        return any(point == path or path in point.parents for point in points)
    # macOS development/tests have no mountinfo; retain the portable check.
    for directory, children, _ in os.walk(str(path), followlinks=False):
        if os.path.ismount(directory):
            return True
        for child in children:
            if os.path.ismount(os.path.join(directory, child)):
                return True
    return False


def receipts(root):
    directory = root / "receipts"
    if directory.is_symlink():
        raise ValueError("receipts directory is a symlink")
    found = []
    for path in sorted(directory.glob("deploy-*.json"), reverse=True):
        if path.is_symlink():
            raise ValueError("deployment receipt is a symlink: " + str(path))
        data = json.loads(path.read_text())
        if isinstance(data, dict) and SHA.fullmatch(str(data.get("sha", ""))):
            found.append((path, data))
    return found


def failed_backups(root):
    directory = root / "receipts"
    if directory.is_symlink():
        raise ValueError("receipts directory is a symlink")
    found = {}
    for path in sorted(directory.glob("failed-*.json")):
        match = FAILED_RECEIPT.fullmatch(path.name)
        if not match or path.is_symlink():
            continue
        data = json.loads(path.read_text())
        if not isinstance(data, dict) or data.get("sha") != match.group(2) or data.get("failedAt") != match.group(1):
            continue
        expected = root / "backups" / ("auto-" + match.group(2) + "-" + match.group(1))
        if data.get("backupDir") != str(expected) or type(data.get("backupComplete")) is not bool:
            continue
        found[expected] = data["backupComplete"]
    return found


def standard_backup_files(path):
    if path.is_symlink() or not path.is_dir():
        return False
    for item in path.iterdir():
        if item.is_symlink() or not item.is_file():
            return False
        if item.name != "schema-before.db" and not BACKUP_FILE.fullmatch(item.name):
            return False
    return True


def previous_revision(code, receipt):
    value = receipt.get("previousCode")
    if not value:
        return None
    previous = Path(value)
    if previous.parent != code or not SHA.fullmatch(previous.name):
        raise ValueError("rollback release points outside code root")
    return previous.name


def retired_marker(root, sha, current):
    return root / "receipts" / ("retired-" + current + "-" + sha + ".json")


def backup_valid(path):
    if path.is_symlink() or not path.is_dir():
        return False
    archives = list(path.glob("*.tar.gz"))
    if len(archives) != 1:
        return False
    archive = archives[0]
    checksum = Path(str(archive) + ".sha256")
    allowed = {archive.name, checksum.name, "schema-before.db"}
    if any(item.name not in allowed or item.is_symlink() or not item.is_file() for item in path.iterdir()):
        return False
    if archive.is_symlink() or checksum.is_symlink() or not archive.is_file() or not checksum.is_file():
        return False
    try:
        line = checksum.read_text().strip()
        expected, name = line.split(None, 1)
        if not re.fullmatch(r"[0-9a-fA-F]{64}", expected) or Path(name.lstrip("*")) != archive:
            return False
        digest = hashlib.sha256()
        with archive.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != expected.lower():
            return False
        with gzip.open(str(archive), "rb") as stream:
            for _ in iter(lambda: stream.read(1024 * 1024), b""):
                pass  # Verify the compressed stream and gzip trailer in full.
        with tarfile.open(str(archive), "r:gz") as bundle:
            members = bundle.getmembers()
            if not any(item.name == "data" or item.name.startswith("data/") for item in members):
                return False
        return True
    except (OSError, ValueError, tarfile.TarError, EOFError):
        return False


def plan(root, candidate, proc, phase="complete", discard_candidate=False):
    root = root.resolve(strict=True)
    code = root / "code"
    if code.is_symlink() or not code.is_dir() or not SHA.fullmatch(candidate):
        raise ValueError("invalid code root or candidate")
    if phase not in ("prepare", "complete"):
        raise ValueError("invalid cleanup phase")
    if discard_candidate and phase != "prepare":
        raise ValueError("candidate can only be discarded during prepare")
    pointer = code / "current"
    if not pointer.exists() and not pointer.is_symlink():
        return {candidate}, []  # No successful installation yet.
    current = pointer.resolve(strict=True)
    if current.parent != code:
        raise ValueError("current release points outside code root")
    release(code, current.name)
    history = receipts(root)
    current_receipt = next((data for _, data in history if data["sha"] == current.name), None)
    if current_receipt is None:
        raise ValueError("current release receipt is missing; cannot identify rollback")
    previous = previous_revision(code, current_receipt)
    keep = {current.name}
    active = active_revisions(code, proc)
    if phase == "prepare":
        if previous and not (code / previous).exists():
            marker = retired_marker(root, previous, current.name)
            if marker.is_symlink() or not marker.is_file() or json.loads(marker.read_text()) != {"current": current.name, "retired": previous}:
                raise ValueError("rollback release missing without retirement record")
        if discard_candidate and ((code / candidate).exists() or (code / candidate).is_symlink()):
            if candidate in active and candidate != current.name:
                raise ValueError("candidate is active")
            if candidate == current.name:
                keep.add(candidate)
            else:
                release(code, candidate)
        elif not discard_candidate:
            keep.add(candidate)
    elif previous:
        marker = retired_marker(root, previous, current.name)
        if (code / previous).exists():
            release(code, previous)
            keep.add(previous)
        elif not marker.is_file() or marker.is_symlink():
            raise ValueError("rollback release missing without retirement record")
        else:
            state = json.loads(marker.read_text())
            if state != {"current": current.name, "retired": previous}:
                raise ValueError("invalid retirement record")
    keep.update(active)
    paths = []
    for path in sorted(code.iterdir()):
        if not SHA.fullmatch(path.name) or path.name in keep or path.is_symlink():
            continue
        try:
            release(code, path.name)
        except (OSError, ValueError):
            continue  # Unknown and legacy directories are preserved.
        paths.append(path)
    staging = root / "staging"
    if staging.is_dir() and not staging.is_symlink():
        for path in sorted(staging.iterdir()):
            if path.is_symlink():
                continue
            owned_sha = None
            if ARCHIVE.fullmatch(path.name):
                archive_match = re.match(r"(?:artifact-)?([0-9a-f]{40})(?:\.tar\.gz|\.(?:zip|json))$", path.name)
                owned_sha = archive_match.group(1) if archive_match else None
            elif UPLOAD_TEMP.fullmatch(path.name):
                owned_sha = UPLOAD_TEMP.fullmatch(path.name).group(1)
            else:
                extract_match = re.match(r"\.?([0-9a-f]{40})\.[0-9]+\.tmp$", path.name)
                owned_sha = extract_match.group(1) if extract_match else None
            if phase == "prepare" and owned_sha == candidate and not discard_candidate:
                continue
            if ARCHIVE.fullmatch(path.name) and path.is_file():
                paths.append(path)
            elif UPLOAD_TEMP.fullmatch(path.name) and path.is_file():
                paths.append(path)
            elif EXTRACT.fullmatch(path.name) and path.is_dir():
                paths.append(path)
    backups = root / "backups"
    if backups.is_dir() and not backups.is_symlink():
        successful = {(data["sha"], data.get("deployedAt")) for _, data in history}
        failed = failed_backups(root)
        matched = []
        failed_matched = []
        unknown_auto = 0
        for path in backups.iterdir():
            match = AUTO_BACKUP.fullmatch(path.name)
            if match and (match.group(1), match.group(2)) in successful and not path.is_symlink():
                matched.append(path)
            elif match and path in failed and not path.is_symlink():
                failed_matched.append(path)
            elif match:
                unknown_auto += 1
        if unknown_auto:
            print("WARNING: preserving {} automatic backup(s) without a matching receipt".format(unknown_auto))
        matched.sort(key=lambda path: AUTO_BACKUP.fullmatch(path.name).group(2))
        # Invalid backups remain untouched. Valid successful recovery points
        # still establish a safe floor even if an older backup is damaged.
        valid_success = [path for path in matched if backup_valid(path)]
        if len(valid_success) >= 2:
            if len(valid_success) > 2:
                protected = set(valid_success[-2:])
                for sha in (current.name, previous):
                    matching = [path for path in valid_success if AUTO_BACKUP.fullmatch(path.name).group(1) == sha]
                    if matching:
                        protected.add(matching[-1])
                paths.extend(path for path in valid_success if path not in protected)
            failed_matched.sort(key=lambda path: AUTO_BACKUP.fullmatch(path.name).group(2))
            valid_failed = [path for path in failed_matched if failed[path] and backup_valid(path)]
            newest_success = AUTO_BACKUP.fullmatch(valid_success[-1].name).group(2)
            protected_failed = (valid_failed[-1] if valid_failed and
                                AUTO_BACKUP.fullmatch(valid_failed[-1].name).group(2) > newest_success else None)
            for path in failed_matched:
                if path != protected_failed and standard_backup_files(path) and not has_mount(path):
                    paths.append(path)
    return keep, paths


def prune(root, candidate, proc, apply=False, phase="complete", discard_candidate=False):
    root = root.resolve(strict=True)
    keep, paths = plan(root, candidate, proc, phase, discard_candidate)
    print("Preserving revisions: " + ", ".join(sorted(keep)))
    if apply and not shutil.rmtree.avoids_symlink_attacks:
        raise RuntimeError("safe directory removal is unavailable on this platform")
    code = root / "code"
    receipt = next((data for _, data in receipts(root) if data["sha"] == (code / "current").resolve().name), None)
    previous = previous_revision(code, receipt) if receipt else None
    for path in paths:
        print(("Removing: " if apply else "Would remove: ") + str(path))
        if not apply:
            continue
        if path.is_symlink() or path.parent.resolve() != path.parent:
            raise RuntimeError("cleanup path changed: " + str(path))
        if path.parent == code:
            release(code, path.name)
            if phase == "prepare" and path.name == previous:
                marker = retired_marker(root, previous, receipt["sha"])
                if marker.is_symlink():
                    raise RuntimeError("retirement record is a symlink")
                if marker.exists():
                    if json.loads(marker.read_text()) != {"current": receipt["sha"], "retired": previous}:
                        raise RuntimeError("invalid retirement record")
                else:
                    with tempfile.NamedTemporaryFile(mode="w", dir=str(marker.parent), prefix=".retirement-", delete=False) as stream:
                        json.dump({"current": receipt["sha"], "retired": previous}, stream)
                        stream.flush()
                        os.fsync(stream.fileno())
                    os.replace(stream.name, str(marker))
            shutil.rmtree(str(path))
        elif path.parent == root / "staging" and path.is_file():
            path.unlink()
        elif path.parent in (root / "staging", root / "backups") and path.is_dir():
            if has_mount(path):
                raise RuntimeError("cleanup directory contains a mount: " + str(path))
            if path.parent == root / "backups":
                if path not in plan(root, candidate, proc, phase, discard_candidate)[1]:
                    raise RuntimeError("backup retention protections changed: " + str(path))
                known_failed = path in failed_backups(root)
                if not standard_backup_files(path) or (not known_failed and not backup_valid(path)):
                    raise RuntimeError("backup changed during cleanup: " + str(path))
            shutil.rmtree(str(path))
        else:
            raise RuntimeError("unrecognized cleanup path: " + str(path))
    return paths


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate")
    parser.add_argument("--phase", choices=("prepare", "complete"), default="complete")
    parser.add_argument("--discard-candidate", action="store_true", help="discard an abandoned verified candidate before upload")
    parser.add_argument("--apply", action="store_true", help="default is read-only")
    parser.add_argument("--lock-fd", type=int, help="inherit the installer's deployment lock")
    args = parser.parse_args()
    if args.lock_fd is None:
        with open(LOCK, "a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            prune(Path("/srv/empact"), args.candidate, Path("/proc"), args.apply, args.phase, args.discard_candidate)
    else:
        if os.readlink("/proc/self/fd/" + str(args.lock_fd)) != LOCK:
            raise ValueError("inherited descriptor is not the deployment lock")
        fcntl.flock(args.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        prune(Path("/srv/empact"), args.candidate, Path("/proc"), args.apply, args.phase, args.discard_candidate)


if __name__ == "__main__":
    main()
