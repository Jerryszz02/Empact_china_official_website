#!/usr/bin/python3 -I
"""Prune reproducible caches only; preserve release source, data and backups."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil

SHA = re.compile(r"[0-9a-f]{40}")
CACHES = ("node_modules", "apps/cms/.next")
LOCK = "/run/lock/empact-deploy.lock"


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
            pass  # The process exited during inspection. Permission errors fail closed.
    return active


def release(code, sha):
    if not isinstance(sha, str) or not SHA.fullmatch(sha):
        raise ValueError("invalid release revision")
    path = code / sha
    marker = path / ".code-revision"
    if path.is_symlink() or marker.is_symlink() or marker.read_text().strip() != sha:
        raise ValueError("unverified release directory: " + sha)
    return path


def plan(root, candidate, proc):
    root = root.resolve(strict=True)
    code = root / "code"
    if code.is_symlink() or not SHA.fullmatch(candidate):
        raise ValueError("invalid code root or candidate")
    if not (code / "current").exists() and not (code / "current").is_symlink():
        return {candidate}, []  # First deployment: no known old releases to prune.
    current = (code / "current").resolve(strict=True)
    if current.parent != code:
        raise ValueError("current release points outside code root")
    release(code, current.name)
    keep = {current.name, candidate}
    receipt = None
    for path in sorted((root / "receipts").glob("deploy-*.json"), reverse=True):
        data = json.loads(path.read_text())
        if data.get("sha") == current.name:
            receipt = data
            break
    if receipt is None:
        raise ValueError("current release receipt is missing; cannot identify rollback")
    if receipt.get("previousCode"):
        previous = Path(receipt["previousCode"])
        if previous.parent != code:
            raise ValueError("rollback release points outside code root")
        release(code, previous.name)
        keep.add(previous.name)
    keep.update(active_revisions(code, proc))
    paths = []
    for path in sorted(code.iterdir()):
        if not SHA.fullmatch(path.name) or path.name in keep or path.is_symlink():
            continue
        try:
            release(code, path.name)
        except (OSError, ValueError):
            continue  # Unknown/legacy directories are deliberately preserved.
        for relative in CACHES:
            cache = path / relative
            if cache.is_dir() and not cache.is_symlink() and cache.resolve() == cache:
                paths.append(cache)
    return keep, paths


def prune(root, candidate, proc, apply=False):
    keep, paths = plan(root, candidate, proc)
    print("Preserving revisions: " + ", ".join(sorted(keep)))
    if apply and not shutil.rmtree.avoids_symlink_attacks:
        raise RuntimeError("safe directory removal is unavailable on this platform")
    for path in paths:
        print(("Removing cache: " if apply else "Would remove cache: ") + str(path))
        if apply:
            if path.is_symlink() or path.resolve() != path:
                raise RuntimeError("cache path changed during cleanup")
            shutil.rmtree(str(path))
    return paths


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate")
    parser.add_argument("--apply", action="store_true", help="default is read-only")
    parser.add_argument("--lock-fd", type=int, help="inherit the installer's deployment lock")
    args = parser.parse_args()
    if args.lock_fd is None:
        with open(LOCK, "a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            prune(Path("/srv/empact"), args.candidate, Path("/proc"), args.apply)
    else:
        if os.readlink("/proc/self/fd/" + str(args.lock_fd)) != LOCK:
            raise ValueError("inherited descriptor is not the deployment lock")
        fcntl.flock(args.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        prune(Path("/srv/empact"), args.candidate, Path("/proc"), args.apply)


if __name__ == "__main__":
    main()
