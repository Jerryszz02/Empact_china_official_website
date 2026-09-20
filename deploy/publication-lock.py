#!/usr/bin/env python3
"""Coordinate maintenance with the CMS publisher's exclusive lock file."""
import argparse
import json
import os
import time
from pathlib import Path


def acquire(runtime, token, timeout=240):
    path = Path(runtime) / "publish.lock"
    deadline = time.monotonic() + timeout
    while True:
        try:
            fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            if time.monotonic() >= deadline:
                raise RuntimeError("CMS publication is still locked; maintenance cancelled")
            time.sleep(0.1)
            continue
        with os.fdopen(fd, "w") as handle:
            json.dump({"maintenanceToken": token, "pid": os.getppid()}, handle)
        return


def release(runtime, token):
    path = Path(runtime) / "publish.lock"
    if not path.exists():
        return
    with path.open() as handle:
        record = json.load(handle)
    if record.get("maintenanceToken") != token:
        raise RuntimeError("Refusing to remove a publication lock owned by another process")
    path.unlink()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["acquire", "release"])
    parser.add_argument("runtime")
    parser.add_argument("token")
    args = parser.parse_args()
    globals()[args.operation](args.runtime, args.token)
