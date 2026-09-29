#!/usr/bin/env python3
"""Exercise maintenance success and health-failure rollback on disposable paths."""
import os
import importlib.util
from unittest.mock import patch
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).parents[1]
FAKE = r'''
import os, pathlib, sys
p = pathlib.Path
root = p(os.environ['FIXTURE_ROOT'])
name, args = p(sys.argv[0]).name, sys.argv[1:]
with (root / 'commands').open('a') as log: log.write(name + ' ' + ' '.join(args) + '\n')
if name == 'readlink': print(p(args[-1]).resolve())
elif name == 'systemctl':
    if args[:3] == ['is-active', '--quiet', 'empact-backup.service']: sys.exit(3)
    if args[0] == 'stop' and os.environ.get('FAIL_STOP') and not (root / 'stop-failed').exists():
        (root / 'stop-failed').touch()
        sys.exit(5)
    if args[0] == 'show':
        print(str(root / 'etc/empact/public.env') + ' (ignore_errors=no)' if 'EnvironmentFiles' in args else 'empact-public')
elif name == 'getent':
    print('empact-public:x:2000:' if args[0] == 'group' else 'empact-public:x:1002:2000::/nonexistent:/sbin/nologin')
elif name == 'id':
    print('1002' if args[0] == '-u' else 'empact-public' if args[0] == '-gn' else '2000')
elif name == 'getfacl': print('fixture ACL')
elif name == 'install':
    if '-d' in args: p(args[-1]).mkdir(parents=True, exist_ok=True)
    else:
        source, dest = p(args[-2]), p(args[-1])
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(source.read_bytes())
elif name == 'node': p(args[-1]).write_text('SITE_URL="https://empact.cn"\n')
elif name == 'curl' and os.environ.get('FAIL_HEALTH'): sys.exit(22)
elif name == 'runuser':
    if 'test' in args:
        path = args[-1]
        if '-w' in args or path.endswith('cms.db') or path.endswith('website.env') or path.endswith('snapshot.json'): sys.exit(1)
'''


class IsolationInstallerTests(unittest.TestCase):
    def execute(self, fail=False, stop=False):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name).resolve()
        code = root / 'srv/code' / ('a' * 40)
        code.mkdir(parents=True)
        (code.parent / 'current').symlink_to(code)
        src = root / 'source/deploy'
        src.mkdir(parents=True)
        for base in [src.parent, code]:
            (base / 'apps/cms/src').mkdir(parents=True)
            for name in ['public-permissions.ts', 'build-workspace.ts']:
                (base / 'apps/cms/src' / name).write_text('fixture')
        (root / 'etc/empact').mkdir(parents=True)
        (root / 'etc/empact/website.env').write_text('PAYLOAD_SECRET=fixture-secret\n')
        units = root / 'etc/systemd/system'
        units.mkdir(parents=True)
        for name in ['empact-cms.service', 'empact-public.service', 'empact-expiry.service']:
            (units / name).write_text('old unit')
            (src / name).write_text('new unit')
        (root / 'srv/data/site/releases/one/public').mkdir(parents=True)
        (root / 'srv/data/site/current').symlink_to(root / 'srv/data/site/releases/one/public')
        (root / 'lock').mkdir()
        (root / 'tools').mkdir()
        for name in ['secure-runtime.py', 'publication-lock.py']:
            path = root / 'tools' / name
            path.write_text('#!/bin/sh\nexit 0\n')
            path.chmod(0o755)
        binary = root / 'bin'
        binary.mkdir()
        for name in ['readlink', 'systemctl', 'systemd-analyze', 'getent', 'id', 'getfacl', 'setfacl', 'install', 'node', 'runuser', 'curl', 'chown', 'chgrp', 'usermod', 'flock']:
            path = binary / name
            path.write_text('#!' + sys.executable + '\n' + FAKE)
            path.chmod(0o755)
        script = (ROOT / 'deploy/install-isolation.sh').read_text()
        script = script.replace('/srv/empact', str(root / 'srv')).replace('/etc/empact', str(root / 'etc/empact'))
        script = script.replace('/etc/systemd/system', str(units)).replace('/usr/local/lib/empact', str(root / 'tools'))
        script = script.replace('/run/lock', str(root / 'lock')).replace('/usr/bin/node', str(binary / 'node'))
        script = script.replace('[[ $EUID == 0 ]]', '[[ 1 == 1 ]]')
        target = src / 'install-isolation.sh'
        target.write_text(script)
        env = dict(os.environ, FIXTURE_ROOT=str(root), PATH=str(binary) + os.pathsep + os.environ['PATH'])
        if fail: env['FAIL_HEALTH'] = '1'
        if stop: env['FAIL_STOP'] = '1'
        result = subprocess.run(['bash', str(target)], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, universal_newlines=True, timeout=20)
        return root, result

    def test_success_activates_isolation_after_checks(self):
        root, result = self.execute()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertTrue((root / 'etc/empact/runtime-isolation.enabled').exists())
        self.assertEqual((root / 'etc/systemd/system/empact-public.service').read_text(), 'new unit')
        commands = (root / 'commands').read_text()
        self.assertIn('runuser -u empact-public -- test -r', commands)
        self.assertIn('runuser -u empact -- test -w', commands)

    def test_partial_stop_failure_still_restores_running_services(self):
        root, result = self.execute(stop=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('systemctl start empact-public.service empact-cms.service', (root / 'commands').read_text())
        self.assertEqual((root / 'etc/systemd/system/empact-public.service').read_text(), 'old unit')

    def test_failed_health_restores_configuration_without_restoring_data(self):
        root, result = self.execute(True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((root / 'etc/empact/runtime-isolation.enabled').exists())
        self.assertEqual((root / 'etc/empact/website.env').read_text(), 'PAYLOAD_SECRET=fixture-secret\n')
        self.assertEqual((root / 'etc/systemd/system/empact-public.service').read_text(), 'old unit')
        commands = (root / 'commands').read_text()
        self.assertIn('setfacl --restore=', commands)
        self.assertIn('systemctl start empact-public.service empact-cms.service', commands)
        self.assertNotIn('restore.sh', commands)


class RuntimeOwnershipTests(unittest.TestCase):
    def test_runtime_ownership_preserves_execute_bits_and_does_not_follow_links(self):
        spec = importlib.util.spec_from_file_location('secure_runtime', ROOT / 'deploy/secure-runtime.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            code = base / 'code'
            (code / 'apps/cms/src').mkdir(parents=True)
            (code / 'apps/cms/src/build-workspace.ts').write_text('fixture')
            executable = code / 'command'
            executable.write_text('fixture')
            executable.chmod(0o700)
            external = base / 'private'
            external.write_text('private')
            external.chmod(0o600)
            (code / 'link').symlink_to(external)
            with patch.object(module.os, 'chown') as chown:
                module.secure(code)
                self.assertTrue(all(call.kwargs == {'follow_symlinks': False} for call in chown.call_args_list))
            self.assertEqual(executable.stat().st_mode & 0o777, 0o755)
            self.assertEqual((code / 'apps/cms/src/build-workspace.ts').stat().st_mode & 0o777, 0o644)
            self.assertEqual(external.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(ValueError): module.secure(base / 'private')


if __name__ == '__main__': unittest.main()
