#!/usr/bin/env python3
"""Exercise real tar/SQLite verification, retention and maintenance failures."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import tarfile
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), ROOT / 'deploy' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


backup = load('monthly-backup')
retention = load('backup-retention')


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.backups = self.root / 'backups'
        self.backups.mkdir()
        self.data = self.root / 'data'
        self.data.mkdir()
        connection = sqlite3.connect(str(self.data / 'cms.db'))
        connection.execute('CREATE TABLE examples (value TEXT)')
        connection.execute("INSERT INTO examples VALUES ('private content')")
        connection.commit()
        connection.close()
        (self.data / 'media').mkdir()
        (self.data / 'media/image.jpg').write_bytes(b'original media')

    def archive(self, stamp, folder=''):
        directory = self.backups / folder
        directory.mkdir(exist_ok=True)
        path = directory / ('empact-' + stamp + '.tar.gz')
        with tarfile.open(str(path), 'w:gz') as bundle:
            bundle.add(self.data, arcname='data')
        Path(str(path) + '.sha256').write_text(retention.digest(path) + '  ' + str(path) + '\n')
        return path

    def test_verifies_extracted_database_and_media(self):
        archive = self.archive('20260929T030000Z')
        result = retention.verify(archive.parent)
        self.assertEqual(result['databaseIntegrity'], 'ok')
        self.assertEqual(result['databaseTables'], 1)
        self.assertEqual(result['mediaFiles'], 1)
        self.assertFalse(list(archive.parent.glob('.verify-*')))

    def test_one_latest_archive_across_manual_deploy_and_monthly(self):
        old = self.archive('20260920T030000Z')
        deploy = self.archive('20260928T030000Z', 'auto-example')
        manual = self.archive('20260923T030000Z', 'manual-example')
        new = self.archive('20260929T030000Z', 'monthly')
        protected = self.backups / 'manual-example/schema-before.db'
        protected.write_bytes(b'database-only snapshot')
        self.assertEqual(set(retention.retire_older(new, self.backups)), {str(old), str(deploy), str(manual)})
        self.assertEqual(list(self.backups.rglob('*.tar.gz')), [new])
        self.assertTrue(protected.exists())
        self.assertEqual(retention.retire_older(new, self.backups), [])

    def test_corrupt_replacement_keeps_previous(self):
        old = self.archive('20260920T030000Z')
        new = self.archive('20260929T030000Z', 'monthly')
        new.write_bytes(b'broken')
        with self.assertRaisesRegex(RuntimeError, 'checksum'):
            retention.retire_older(new, self.backups)
        self.assertTrue(old.exists())

    def test_invalid_database_with_valid_checksum_keeps_previous(self):
        old = self.archive('20260920T030000Z')
        (self.data / 'cms.db').write_bytes(b'broken sqlite')
        new = self.archive('20260929T030000Z', 'monthly')
        with self.assertRaises(sqlite3.DatabaseError):
            retention.retire_older(new, self.backups)
        self.assertTrue(old.exists())

    def test_corrupt_gzip_trailer_is_rejected(self):
        archive = self.archive('20260929T030000Z')
        content = bytearray(archive.read_bytes()); content[-5] ^= 1
        archive.write_bytes(content)
        Path(str(archive) + '.sha256').write_text(retention.digest(archive))
        with self.assertRaises(OSError):
            retention.verify(archive.parent)

    def test_unknown_and_newer_archives_preserved(self):
        unknown = self.archive('20260920T030000Z')
        Path(str(unknown) + '.sha256').unlink()
        newer = self.archive('20260930T030000Z', 'future')
        current = self.archive('20260929T030000Z', 'monthly')
        retention.retire_older(current, self.backups)
        self.assertTrue(unknown.exists())
        self.assertTrue(newer.exists())

    def test_outside_or_symlink_destinations_cannot_retire_backups(self):
        archive = self.archive('20260929T030000Z')
        link = self.root / 'link'
        link.symlink_to(self.backups, target_is_directory=True)
        with self.assertRaises(RuntimeError):
            retention.retire_older(link / archive.name, self.backups)
        with self.assertRaises(RuntimeError):
            retention.retire_older(archive, self.root / 'elsewhere')

    def test_backup_failure_restores_all_original_services_and_releases_lock(self):
        calls = []
        helper = mock.Mock()
        def run(*args):
            calls.append(args)
            if str(args[0]).endswith('backup.sh'):
                raise RuntimeError('archive failed')
        with mock.patch.object(backup, 'active', return_value=True), mock.patch.object(backup, 'run', side_effect=run):
            with self.assertRaisesRegex(RuntimeError, 'archive failed'):
                backup.maintain(self.backups, helper)
        helper.release.assert_called_once()
        for unit in ['empact-cms.service', 'empact-expiry.service', 'empact-expiry.timer']:
            self.assertIn(('systemctl', 'start', unit), calls)

    def test_cms_restart_failure_still_restores_timer(self):
        calls = []
        def run(*args):
            calls.append(args)
            if args == ('systemctl', 'start', 'empact-cms.service'):
                raise RuntimeError('CMS failed')
        with mock.patch.object(backup, 'active', return_value=True), mock.patch.object(backup, 'run', side_effect=run):
            with self.assertRaisesRegex(RuntimeError, 'restoration failed'):
                backup.maintain(self.backups, mock.Mock())
        self.assertIn(('systemctl', 'start', 'empact-expiry.timer'), calls)

    def test_inactive_services_stay_inactive(self):
        with mock.patch.object(backup, 'active', return_value=False), mock.patch.object(backup, 'run') as command:
            backup.maintain(self.backups, mock.Mock())
        self.assertFalse(any(call.args[:2] == ('systemctl', 'start') for call in command.call_args_list))

    def test_busy_publication_does_not_stop_services(self):
        helper = mock.Mock()
        helper.acquire.side_effect = RuntimeError('busy')
        with mock.patch.object(backup, 'active', return_value=True), mock.patch.object(backup, 'run') as command:
            with self.assertRaisesRegex(RuntimeError, 'busy'):
                backup.maintain(self.backups, helper)
        command.assert_not_called()
        helper.release.assert_not_called()


if __name__ == '__main__':
    unittest.main()
