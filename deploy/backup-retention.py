#!/usr/bin/env python3
"""Verify a new full recovery point before retiring older full archive pairs."""
import gzip
import hashlib
import json
from pathlib import Path
import re
import shutil
import sqlite3
import sys
import tarfile
import tempfile

ARCHIVE = re.compile(r'empact-([0-9]{8}T[0-9]{6}Z)\.tar\.gz$')

def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def verify(directory, archive=None):
    archives = [archive] if archive is not None else list(directory.glob('empact-*.tar.gz'))
    if len(archives) != 1 or archives[0].is_symlink():
        raise RuntimeError('Expected one regular backup archive')
    archive = archives[0]
    sidecar = Path(str(archive) + '.sha256')
    if sidecar.is_symlink():
        raise RuntimeError('Invalid checksum file')
    checksum = digest(archive)
    if sidecar.read_text().split()[0] != checksum:
        raise RuntimeError('Backup checksum mismatch')
    # Read through the gzip trailer, including its CRC, not just tar headers.
    with gzip.open(archive, 'rb') as stream:
        while stream.read(1024 * 1024):
            pass
    files = 0
    media = 0
    with tempfile.TemporaryDirectory(prefix='.verify-', dir=directory) as work:
        with tarfile.open(archive, 'r:gz') as bundle:
            for member in bundle:
                path = Path(member.name)
                if path.is_absolute() or '..' in path.parts or path.parts[0] != 'data':
                    raise RuntimeError('Unexpected archive path')
                if member.isfile():
                    files += 1
                    media += member.name.startswith('data/media/')
                if member.name in ('data/cms.db', 'data/cms.db-wal', 'data/cms.db-shm'):
                    if not member.isfile():
                        raise RuntimeError('Database must be a regular file')
                    with bundle.extractfile(member) as src, open(Path(work) / path.name, 'wb') as dst:
                        shutil.copyfileobj(src, dst)
        database = Path(work) / 'cms.db'
        if not database.is_file():
            raise RuntimeError('CMS database missing from archive')
        connection = sqlite3.connect(str(database))
        try:
            checks = connection.execute('PRAGMA integrity_check').fetchall()
            if checks != [('ok',)]:
                raise RuntimeError('Restored CMS database integrity check failed')
            tables = connection.execute("SELECT count(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
            if tables == 0:
                raise RuntimeError('CMS database has no tables')
        finally:
            connection.close()
    return dict(archive=archive.name, sha256=checksum, bytes=archive.stat().st_size,
                files=files, mediaFiles=media, databaseIntegrity='ok', databaseTables=tables)


def retire_older(archive, root):
    archive, root = Path(archive), Path(root)
    if root.is_symlink() or archive.is_symlink() or archive.resolve() != archive:
        raise RuntimeError('Backup paths must not contain symlinks')
    if not ARCHIVE.fullmatch(archive.name) or root not in archive.parents:
        raise RuntimeError('Backup is outside the managed archive directory')
    result = verify(archive.parent, archive)
    # A valid replacement is required before any old archive is removed.
    removed = []
    for previous in sorted(root.rglob('empact-*.tar.gz')):
        if previous == archive or previous.resolve() != previous or not previous.is_file():
            continue
        match = ARCHIVE.fullmatch(previous.name)
        if not match or match.group(1) >= ARCHIVE.fullmatch(archive.name).group(1):
            continue
        sidecar = Path(str(previous) + '.sha256')
        if not sidecar.is_file() or sidecar.is_symlink():
            continue  # Unknown/manual files are preserved for inspection.
        # Retire only standard complete archive pairs, not installer backups,
        # database-only snapshots, receipts, or arbitrary directory contents.
        expected = sidecar.read_text().split()
        if not expected or expected[0] != digest(previous):
            continue
        previous.unlink()
        sidecar.unlink()
        removed.append(str(previous))
    print(json.dumps(dict(verified=result, retired=removed)), flush=True)
    return removed


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: backup-retention.py /srv/empact/backups/.../empact-TIMESTAMP.tar.gz')
    retire_older(Path(sys.argv[1]), Path('/srv/empact/backups'))
