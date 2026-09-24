#!/usr/bin/python3 -I
"""Build and safely unpack the CI-built, SHA-bound runtime archive.

The server reads only a GitHub-validated ZIP staged by actions-command.py.
No production configuration, database, media, or preview output is packaged.
"""
import argparse
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import platform
import re
import stat
import subprocess
import sys
import tarfile
import zipfile

SHA = re.compile(r"[0-9a-f]{40}")
GLIBC = re.compile(br"GLIBC_([0-9]+)\.([0-9]+)")
MAX_ZIP_BYTES = 2 * 1024 ** 3
MAX_EXPANDED_BYTES = 4 * 1024 ** 3
STAGING = Path("/srv/empact/staging")
RUNTIME_NAME = "empact-runtime.tar.gz"
MANIFEST_NAME = ".empact-runtime.json"


def artifact_name(sha, attempt):
    if not isinstance(sha, str) or not SHA.fullmatch(sha):
        raise ValueError("invalid runtime SHA")
    if not isinstance(attempt, int) or isinstance(attempt, bool) or attempt < 1:
        raise ValueError("invalid CI attempt")
    return "empact-runtime-{}-{}".format(sha, attempt)


def validate_artifact(sha, artifact_id, artifact, run, repository):
    """Validate public GitHub API metadata against the independently selected CI run."""
    if not isinstance(artifact_id, int) or isinstance(artifact_id, bool) or artifact_id < 1:
        raise ValueError("invalid artifact ID")
    if not isinstance(artifact, dict) or not isinstance(run, dict):
        raise ValueError("missing artifact or CI run metadata")
    attempt = run.get("run_attempt")
    run_id = run.get("id")
    if (not isinstance(attempt, int) or isinstance(attempt, bool) or attempt < 1 or
            not isinstance(run_id, int) or isinstance(run_id, bool) or run_id < 1 or
            not isinstance(run.get("repository"), dict)):
        raise ValueError("CI attempt missing")
    expected_name = artifact_name(sha, attempt)
    if (run.get("head_sha") != sha or run.get("head_branch") != "main" or
            run.get("event") != "push" or run.get("status") != "completed" or
            run.get("conclusion") != "success" or
            run.get("repository", {}).get("full_name") != repository):
        raise ValueError("CI run is not a successful push to this repository's main")
    source = artifact.get("workflow_run")
    if not isinstance(source, dict):
        raise ValueError("artifact CI provenance missing")
    if (artifact.get("id") != artifact_id or artifact.get("name") != expected_name or
            artifact.get("expired") is not False or source.get("id") != run.get("id") or
            source.get("head_sha") != sha or source.get("head_branch") != "main"):
        raise ValueError("artifact is not from the approved CI run")
    digest = artifact.get("digest")
    size = artifact.get("size_in_bytes")
    if (not isinstance(digest, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", digest) or
            not isinstance(size, int) or isinstance(size, bool) or size < 1 or size > MAX_ZIP_BYTES):
        raise ValueError("artifact digest or size is unavailable or out of budget")
    return {"format": 1, "sha": sha, "artifactId": artifact_id, "runId": run_id,
            "runAttempt": attempt, "name": expected_name, "expectedDigest": digest,
            "size": size}


def _sha256(path):
    digest = hashlib.sha256()
    with open(str(path), "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def _check_runtime_platform(node_binary="/usr/bin/node"):
    if platform.system() != "Linux" or platform.machine() not in ("x86_64", "amd64"):
        raise ValueError("runtime requires Linux x64")
    if not isinstance(node_binary, str) or not os.path.isabs(node_binary):
        raise ValueError("runtime Node path must be absolute")
    node = subprocess.check_output([node_binary, "--version"]).decode().strip()
    if not node.startswith("v22."):
        raise ValueError("runtime requires Node 22")
    try:
        libc = os.confstr("CS_GNU_LIBC_VERSION")
    except (AttributeError, OSError, ValueError):
        libc = None
    match = re.fullmatch(r"glibc ([0-9]+)\.([0-9]+)(?:\.[0-9]+)?", libc or "")
    if not match or (int(match.group(1)), int(match.group(2))) < (2, 32):
        raise ValueError("runtime requires glibc 2.32 or newer")


def _check_headroom(path, incoming):
    filesystem = os.statvfs(str(path))
    if filesystem.f_bavail * filesystem.f_frsize < 3 * 1024 ** 3 + incoming:
        raise ValueError("insufficient disk headroom for runtime extraction")


def _safe_name(name):
    if (not name or name.startswith("/") or "\\" in name or "\x00" in name or
            any(part in ("", ".", "..") for part in name.rstrip("/").split("/"))):
        raise ValueError("unsafe archive path")
    return name.rstrip("/")


def _safe_link(name, link):
    if not link or link.startswith("/") or "\\" in link or "\x00" in link:
        raise ValueError("unsafe runtime symlink")
    parts = name.split("/")[:-1]
    for part in link.split("/"):
        if part == "..":
            if not parts:
                raise ValueError("runtime symlink escapes archive")
            parts.pop()
        elif part not in ("", "."):
            parts.append(part)
    if not parts:
        raise ValueError("runtime symlink escapes archive")


def _validate_members(members):
    seen = set()
    links = set()
    total = 0
    for member in members:
        name = _safe_name(member.name)
        if name in seen:
            raise ValueError("duplicate runtime archive member")
        if name == ".code-revision":
            raise ValueError("runtime archive cannot provide the revision marker")
        seen.add(name)
        if member.issym():
            _safe_link(name, member.linkname)
            links.add(name)
        elif member.isfile():
            total += member.size
            if total > MAX_EXPANDED_BYTES:
                raise ValueError("runtime exceeds expanded size budget")
        elif not member.isdir():
            raise ValueError("unsafe runtime archive entry: {!r} (type {!r})".format(name, member.type))
    for name in seen:
        parts = name.split("/")
        if any("/".join(parts[:index]) in links for index in range(1, len(parts))):
            raise ValueError("runtime archive traverses a symlink")
    if MANIFEST_NAME not in seen:
        raise ValueError("runtime manifest missing")
    if not next(member for member in members if member.name == MANIFEST_NAME).isfile():
        raise ValueError("runtime manifest must be a regular file")
    return total


def _verify_zip(sha, staging):
    if staging.is_symlink() or not staging.is_dir() or os.stat(str(staging)).st_uid != 0:
        raise ValueError("trusted runtime staging directory missing")
    metadata = staging / ("artifact-" + sha + ".json")
    archive = staging / ("artifact-" + sha + ".zip")
    for path in (metadata, archive):
        if path.is_symlink() or not path.is_file() or os.stat(str(path)).st_uid != 0:
            raise ValueError("trusted runtime staging file missing")
    data = json.loads(metadata.read_text())
    if (data.get("format") != 1 or data.get("sha") != sha or
            not re.fullmatch(r"sha256:[0-9a-f]{64}", str(data.get("expectedDigest", ""))) or
            archive.stat().st_size != data.get("size") or archive.stat().st_size > MAX_ZIP_BYTES or
            _sha256(archive) != data["expectedDigest"]):
        raise ValueError("staged artifact metadata or digest mismatch")
    return archive


def extract(sha, destination, staging=STAGING, node_binary="/usr/bin/node"):
    if not SHA.fullmatch(sha):
        raise ValueError("invalid runtime SHA")
    destination = Path(destination)
    if destination.is_symlink() or not destination.is_dir() or any(destination.iterdir()):
        raise ValueError("runtime extraction destination must be an empty directory")
    _check_runtime_platform(node_binary)
    archive = _verify_zip(sha, Path(staging))
    with zipfile.ZipFile(str(archive)) as outer:
        entries = outer.infolist()
        if (len(entries) != 1 or entries[0].filename != RUNTIME_NAME or
                entries[0].is_dir() or entries[0].file_size > MAX_ZIP_BYTES):
            raise ValueError("artifact ZIP must contain only the runtime tarball")
        with outer.open(entries[0]) as compressed:
            # The inner tarball is already compressed. A bounded temporary copy
            # avoids relying on seek support in ZipExtFile.
            import tempfile
            _check_headroom(destination.parent, entries[0].file_size)
            with tempfile.TemporaryFile(dir=str(destination.parent)) as inner_file:
                count = 0
                for chunk in iter(lambda: compressed.read(1024 * 1024), b""):
                    count += len(chunk)
                    if count > MAX_ZIP_BYTES:
                        raise ValueError("runtime tarball exceeds size budget")
                    inner_file.write(chunk)
                inner_file.seek(0)
                with tarfile.open(fileobj=inner_file, mode="r:gz") as bundle:
                    members = bundle.getmembers()
                    total = _validate_members(members)
                    manifest_file = bundle.extractfile(MANIFEST_NAME)
                    manifest = json.load(manifest_file)
                    if (manifest.get("format") != 1 or manifest.get("sha") != sha or
                            manifest.get("platform") != "linux" or manifest.get("arch") != "x64" or
                            manifest.get("nodeMajor") != 22 or
                            manifest.get("maxExpandedBytes") != MAX_EXPANDED_BYTES or
                            manifest.get("expandedBytes") != total):
                        raise ValueError("runtime manifest mismatch")
                    _check_headroom(destination.parent, total)
                    for member in members:
                        if member.isdir():
                            (destination / member.name).mkdir(parents=True, exist_ok=True)
                        elif member.isfile():
                            target = destination / member.name
                            target.parent.mkdir(parents=True, exist_ok=True)
                            with bundle.extractfile(member) as source, open(str(target), "xb") as output:
                                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                                    output.write(chunk)
                            target.chmod(0o755 if member.mode & 0o111 else 0o644)
                    for member in members:
                        if member.issym():
                            target = destination / member.name
                            target.parent.mkdir(parents=True, exist_ok=True)
                            os.symlink(member.linkname, str(target))
    root = destination.resolve(strict=True)
    for member in members:
        if member.issym():
            try:
                resolved = (destination / member.name).resolve(strict=True)
            except (OSError, RuntimeError):
                raise ValueError("runtime contains a dangling or cyclic symlink")
            if resolved != root and not str(resolved).startswith(str(root) + os.sep):
                raise ValueError("runtime symlink chain escapes archive")
    for relative in ("package.json", "apps/cms/.next", "node_modules", "apps/site/src"):
        target = destination / relative
        if target.is_symlink() or not (target.is_file() if relative == "package.json" else target.is_dir()):
            raise ValueError("runtime is missing " + relative)
    marker = destination / ".code-revision"
    marker.write_text(sha + "\n")
    marker.chmod(0o600)
    return manifest


def _selected_tracked(root):
    paths = subprocess.check_output(["git", "ls-files", "-z", "--", "apps", "packages", "scripts", "deploy",
                                     "package.json", "package-lock.json", "tsconfig.json"], cwd=str(root)).split(b"\0")
    for raw in paths:
        if not raw:
            continue
        relative = os.fsdecode(raw)
        parts = Path(relative).parts
        if ("tests" in parts or "__tests__" in parts or ".data" in parts or
                relative.startswith("apps/site/dist/") or relative.startswith("apps/site/.astro/") or
                Path(relative).name.startswith(".env")):
            continue
        yield relative


def _runtime_paths(root):
    selected = set(_selected_tracked(root))
    package = json.loads((root / "package.json").read_text())
    patterns = package.get("workspaces")
    if not isinstance(patterns, list) or not all(isinstance(item, str) for item in patterns):
        raise ValueError("root package workspaces are missing")
    dependency_roots = ["node_modules"]
    for pattern in patterns:
        if (not pattern or pattern.startswith("/") or ".." in Path(pattern).parts or
                "\\" in pattern):
            raise ValueError("unsafe workspace pattern")
        for workspace in root.glob(pattern):
            if workspace.is_symlink() or not workspace.is_dir():
                raise ValueError("unsafe workspace directory: " + str(workspace))
            workspace.relative_to(root)
            dependencies = workspace / "node_modules"
            if dependencies.exists() or dependencies.is_symlink():
                dependency_roots.append(str(dependencies.relative_to(root)))
    for base in dependency_roots + ["apps/cms/.next"]:
        source = root / base
        if not source.is_dir() or source.is_symlink():
            raise ValueError("required build directory missing: " + base)
        for directory, dirs, files in os.walk(str(source), followlinks=False):
            relative_dir = os.path.relpath(directory, str(root))
            dirs[:] = [item for item in dirs if item not in (".cache", ".data") and
                       not item.startswith(".env") and
                       not (base == "apps/cms/.next" and item == "cache")]
            selected.add(relative_dir)
            for item in dirs + [name for name in files if not name.startswith(".env")]:
                selected.add(os.path.join(relative_dir, item))
    return sorted(selected)


def _check_elf(path):
    if path.is_symlink() or not path.is_file():
        return
    with path.open("rb") as source:
        if source.read(4) != b"\x7fELF":
            return
        source.seek(0)
        data = source.read()
    versions = [(int(major), int(minor)) for major, minor in GLIBC.findall(data)]
    if any(version > (2, 32) for version in versions):
        raise ValueError("ELF requires GLIBC newer than 2.32: " + str(path))


def pack(sha, output, root=Path(".")):
    if not SHA.fullmatch(sha):
        raise ValueError("invalid runtime SHA")
    root = Path(root).resolve()
    if (subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=str(root)).decode().strip() != sha or
            platform.system() != "Linux" or platform.machine() not in ("x86_64", "amd64") or
            not subprocess.check_output(["node", "--version"]).decode().startswith("v22.")):
        raise ValueError("runtime must be packed from matching SHA on Linux x64 with Node 22")
    paths = _runtime_paths(root)
    expanded = 0
    for relative in paths:
        path = root / relative
        if path.is_symlink():
            _safe_link(relative, os.readlink(str(path)))
        elif path.is_file():
            _check_elf(path)
            expanded += path.stat().st_size
        elif not path.is_dir():
            raise ValueError("unsupported runtime source entry: " + relative)
        if expanded > MAX_EXPANDED_BYTES:
            raise ValueError("runtime exceeds expanded size budget")
    manifest = {"format": 1, "sha": sha, "platform": "linux", "arch": "x64",
                "nodeMajor": 22, "maxExpandedBytes": MAX_EXPANDED_BYTES,
                "expandedBytes": expanded, "runtimeVersion": 1}
    # The manifest also contributes to the expanded byte total.
    while True:
        payload = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
        updated = expanded + len(payload)
        if updated == manifest["expandedBytes"]:
            break
        manifest["expandedBytes"] = updated
    output = Path(output)
    with tarfile.open(str(output), "w:gz", format=tarfile.PAX_FORMAT) as bundle:
        for relative in paths:
            path = root / relative
            source_mode = path.lstat().st_mode
            info = tarfile.TarInfo(relative)
            if stat.S_ISLNK(source_mode):
                info.type = tarfile.SYMTYPE
                info.linkname = os.readlink(str(path))
                _safe_link(relative, info.linkname)
                info.mode = 0o777
                bundle.addfile(info)
            elif stat.S_ISDIR(source_mode):
                info.type = tarfile.DIRTYPE
                info.mode = 0o755
                bundle.addfile(info)
            elif stat.S_ISREG(source_mode):
                # TarFile.add deduplicates equal inodes as hardlink entries,
                # which the production extractor deliberately refuses.
                info.type = tarfile.REGTYPE
                info.size = path.stat().st_size
                info.mode = 0o755 if source_mode & 0o111 else 0o644
                with path.open("rb") as source:
                    bundle.addfile(info, source)
            else:
                raise ValueError("unsupported runtime source entry: " + relative)
        info = tarfile.TarInfo(MANIFEST_NAME)
        info.size = len(payload)
        info.mode = 0o644
        bundle.addfile(info, io.BytesIO(payload))
    if output.stat().st_size > MAX_ZIP_BYTES:
        output.unlink()
        raise ValueError("runtime archive exceeds upload budget")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command")
    for name in ("pack", "extract"):
        command = commands.add_parser(name)
        command.add_argument("sha")
        command.add_argument("path")
    args = parser.parse_args()
    if not args.command:
        parser.error("pack or extract is required")
    if args.command == "pack":
        print(json.dumps(pack(args.sha, args.path), sort_keys=True))
    else:
        print(json.dumps(extract(args.sha, args.path), sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, tarfile.TarError, zipfile.BadZipFile, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
