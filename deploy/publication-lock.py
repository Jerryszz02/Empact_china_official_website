#!/usr/bin/env python3
"""Coordinate CMS publication and deployment maintenance with one lock file."""
import argparse
import contextlib
import fcntl
import json
import os
import stat
import sys
import tempfile
import time
from pathlib import Path


def process_start(pid):
    """Return the kernel process birth marker, when available."""
    try:
        # /proc's comm field may contain spaces and parentheses.
        fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
        return fields[19]
    except (IndexError, OSError):
        return None


def owner_alive(record):
    pid = record.get("pid")
    if type(pid) is not int or pid < 1:
        return True  # An unknown owner is never safe to evict automatically.
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        pass
    expected = record.get("processStart")
    actual = process_start(pid)
    return not (expected is not None and actual is not None and expected != actual)


@contextlib.contextmanager
def guard(runtime):
    root = Path(runtime)
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = root / "publish.guard"
    if os.geteuid() == 0:
        # Publish a root-created guard only after giving its directory owner access.
        temporary_fd, temporary = tempfile.mkstemp(prefix=".publish-guard-", dir=root)
        try:
            owner = root.stat()
            os.fchown(temporary_fd, owner.st_uid, owner.st_gid)
            try:
                os.link(temporary, path)
            except FileExistsError:
                pass
        finally:
            os.close(temporary_fd)
            os.unlink(temporary)
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise RuntimeError("Invalid publication guard")
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def read_record(path):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd) as handle:
            if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
                return None
            return json.load(handle)
    except (OSError, ValueError):
        return None


def create_record(path, record):
    # A killed writer cannot leave an empty new-format lock behind.
    fd, temporary = tempfile.mkstemp(prefix=".publish-lock-", dir=path.parent)
    try:
        if os.geteuid() == 0:
            owner = path.parent.stat()
            os.fchown(fd, owner.st_uid, owner.st_gid)
        with os.fdopen(fd, "w") as handle:
            json.dump(record, handle)
        os.link(temporary, path)  # Fails if an older CMS created a lock meanwhile.
    finally:
        os.unlink(temporary)


def acquire(runtime, token, timeout=240, owner_pid=None, maintenance=True):
    path = Path(runtime) / "publish.lock"
    deadline = time.monotonic() + timeout
    pid = owner_pid or os.getppid()
    record = {
        "pid": pid,
        "processStart": process_start(pid),
        "startedAt": time.time(),
        **({"maintenanceToken": token} if maintenance else {"publicationToken": token}),
    }
    while True:
        with guard(runtime):
            try:
                create_record(path, record)
                return
            except FileExistsError:
                existing = read_record(path)
                if isinstance(existing, dict) and not owner_alive(existing):
                    path.unlink()
                    continue
        if time.monotonic() >= deadline:
            raise RuntimeError("CMS publication is still locked; maintenance cancelled")
        time.sleep(0.1)


def release(runtime, token, maintenance=True):
    path = Path(runtime) / "publish.lock"
    with guard(runtime):
        if not path.exists():
            return
        record = read_record(path)
        key = "maintenanceToken" if maintenance else "publicationToken"
        if not isinstance(record, dict) or record.get(key) != token:
            raise RuntimeError("Refusing to remove a publication lock owned by another process")
        path.unlink()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["acquire", "release"])
    parser.add_argument("runtime")
    parser.add_argument("token")
    parser.add_argument("--cms-owner", type=int)
    args = parser.parse_args()
    try:
        if args.cms_owner:
            if args.operation == "acquire":
                acquire(args.runtime, args.token, timeout=0,
                        owner_pid=args.cms_owner, maintenance=False)
            else:
                release(args.runtime, args.token, maintenance=False)
        else:
            globals()[args.operation](args.runtime, args.token)
    except RuntimeError as error:
        print(error, file=sys.stderr)
        sys.exit(75)
