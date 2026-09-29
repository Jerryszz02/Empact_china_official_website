#!/usr/bin/env python3
"""Monthly local recovery points, serialized with deployment and CMS publication."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time
from datetime import datetime, timezone

ROOT = Path('/srv/empact')
TOOLS = Path('/usr/local/lib/empact')
LOCK = Path('/run/lock/empact-deploy.lock')
CHILD_STOP_TIMEOUT = 10

def run(*args):
    # Isolate the complete child tree so cancellation reaches tar/gzip as well
    # as the shell. Bound this wait well below systemd's cleanup deadline.
    child = subprocess.Popen(args, start_new_session=True)
    try:
        status = child.wait()
    except BaseException:
        try:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                child.wait(timeout=CHILD_STOP_TIMEOUT)
            except subprocess.TimeoutExpired:
                pass
        finally:
            # The group can outlive its leader; reap any remaining descendants.
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait()
        raise
    if status:
        raise subprocess.CalledProcessError(status, args)
    return subprocess.CompletedProcess(args, status)

def active(unit):
    return subprocess.run(['systemctl', 'is-active', '--quiet', unit]).returncode == 0


def maintain(directory, helper):
    runtime = ROOT / 'data/site'
    token = 'monthly-backup-' + str(os.getpid())
    cms = active('empact-cms.service')
    timer = active('empact-expiry.timer')
    expiry = active('empact-expiry.service')
    helper.acquire(runtime, token, owner_pid=os.getpid())
    errors = []
    try:
        run('systemctl', 'stop', 'empact-expiry.timer', 'empact-expiry.service', 'empact-cms.service')
        run(str(TOOLS / 'backup.sh'), str(directory))
    finally:
        try:
            helper.release(runtime, token)
        except Exception as error:
            errors.append(error)
        # Attempt every restoration even when one service fails to restart.
        for unit, enabled in [('empact-cms.service', cms), ('empact-expiry.service', expiry),
                              ('empact-expiry.timer', timer)]:
            if enabled:
                try:
                    run('systemctl', 'start', unit)
                except Exception as error:
                    errors.append(error)
        if errors:
            raise RuntimeError('Backup service restoration failed: ' + str(errors))
    if cms:
        run('curl', '--fail', '--silent', '--show-error', '--retry', '20', '--retry-connrefused',
            '--retry-delay', '2', '--max-time', '15', '--output', '/dev/null',
            'http://127.0.0.1:3000/admin/login')
    run('curl', '--fail', '--silent', '--show-error', '--max-time', '15', '--output', '/dev/null',
        'http://127.0.0.1:4322/release.json')


def interrupted(*_):
    # A repeated stop request must not interrupt service restoration.
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    raise InterruptedError('Backup interrupted')


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Run as root')
    os.umask(0o077)
    # SIGTERM during backup must reach finally to restore the CMS and timer.
    signal.signal(signal.SIGTERM, interrupted)
    with LOCK.open('a') as lock:
        deadline = time.monotonic() + 1800
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise RuntimeError('Deployment still active; backup cancelled')
                time.sleep(5)
        size = int(subprocess.check_output(['du', '-sk', str(ROOT / 'data')]).split()[0]) * 1024
        if shutil.disk_usage(ROOT).free < 3 * 1024**3 + size * 2:
            raise RuntimeError('Insufficient backup disk headroom; no services stopped')
        spec = importlib.util.spec_from_file_location('publication_lock', TOOLS / 'publication-lock.py')
        helper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(helper)
        parent = ROOT / 'backups/monthly'
        parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        if parent.is_symlink() or parent.stat().st_uid != 0:
            raise RuntimeError('Monthly backup directory must be root-owned and not a symlink')
        parent.chmod(0o700)
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        directory = Path(tempfile.mkdtemp(prefix='monthly-' + timestamp + '-', dir=parent))
        maintain(directory, helper)
        verification = importlib.util.spec_from_file_location('backup_retention', TOOLS / 'backup-retention.py')
        retention = importlib.util.module_from_spec(verification)
        verification.loader.exec_module(retention)
        result = retention.verify(directory)
        result.update(kind='empact-monthly-v1', status='success', completedAt=datetime.now(timezone.utc).isoformat(),
                      codeRevision=(ROOT / 'code/current/.code-revision').read_text().strip())
        temporary = directory / '.completed.tmp'
        temporary.write_text(json.dumps(result, indent=2) + '\n')
        temporary.replace(directory / 'completed.json')
        print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
