#!/usr/bin/env python3
"""Protect one trusted release without changing data, credentials or services."""
import os
from pathlib import Path
import re
import pwd
import stat
import sys


def secure(root):
    root = Path(root)
    if root.is_symlink() or not root.is_dir():
        raise ValueError('Expected a real release directory')
    if not (root / 'apps/cms/src/build-workspace.ts').is_file():
        raise ValueError('Release does not support immutable runtime code')
    for directory, dirs, files in os.walk(str(root), followlinks=False):
        for path in [Path(directory)] + [Path(directory) / name for name in dirs + files]:
            info = path.lstat()
            os.chown(str(path), 0, 0, follow_symlinks=False)
            if not stat.S_ISLNK(info.st_mode):
                if not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
                    raise ValueError('Unexpected runtime entry')
                path.chmod(0o755 if stat.S_ISDIR(info.st_mode) or info.st_mode & 0o111 else 0o644)


if __name__ == '__main__':
    if os.geteuid() != 0:
        raise RuntimeError('Run as root')
    if len(sys.argv) != 2 or not re.fullmatch(r'/srv/empact/code/[a-f0-9]{40}', sys.argv[1]):
        raise ValueError('Expected a fixed release under /srv/empact/code')
    secure(sys.argv[1])
    # Next may write image/fetch caches; keep those outside immutable code.
    code = Path(sys.argv[1])
    cache = code / 'apps/cms/.next/cache'
    destination = Path('/srv/empact/cache/next') / code.name
    for parent in (destination.parent.parent, destination.parent):
        if parent.is_symlink(): raise RuntimeError('Unexpected cache parent link')
        parent.mkdir(exist_ok=True)
        os.chown(str(parent), 0, 0)
        parent.chmod(0o755)
    if not cache.is_symlink():
        account = pwd.getpwnam('empact')
        if destination.exists() or destination.is_symlink():
            if destination.is_symlink() or not destination.is_dir() or destination.stat().st_uid != account.pw_uid:
                raise RuntimeError('Unexpected pre-existing runtime cache')
            # Retry the same SHA after a failed deploy without modifying its
            # existing private cache. Preserve packaged cache as immutable code.
            if cache.exists(): cache.rename(code / 'apps/cms/.next/build-cache')
            cache.symlink_to(destination)
            sys.exit(0)
        if cache.exists():
            cache.rename(destination)
        else:
            destination.mkdir()
        for directory, dirs, files in os.walk(str(destination)):
            for path in [Path(directory)] + [Path(directory) / n for n in dirs + files]:
                if path.is_symlink(): raise RuntimeError('Unexpected cache symlink')
                os.chown(str(path), account.pw_uid, account.pw_gid)
                path.chmod(0o700 if path.is_dir() else 0o600)
        cache.symlink_to(destination)
    elif cache.resolve() != destination:
        raise RuntimeError('Unexpected runtime cache link')
