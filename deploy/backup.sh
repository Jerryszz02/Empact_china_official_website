#!/usr/bin/env bash
# Run as root on ECS. Stops only Empact CMS for a consistent SQLite+media snapshot.
set -euo pipefail
umask 077
if [[ $# -ne 1 ]]; then echo 'Usage: sudo deploy/backup.sh /absolute/private/backup-directory' >&2; exit 2; fi
backup_dir=$1
[[ "$backup_dir" = /* && "$backup_dir" != /srv/empact/data* ]] || { echo 'Backup destination must be absolute and outside live data.' >&2; exit 2; }
mkdir -p "$backup_dir"
archive="$backup_dir/empact-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
was_active=false
timer_active=false
if systemctl is-active --quiet empact-cms; then was_active=true; fi
if systemctl is-active --quiet empact-expiry.timer; then timer_active=true; fi
restart_cms() {
  local status=0
  if $was_active; then systemctl start empact-cms || status=1; fi
  if $timer_active; then systemctl start empact-expiry.timer || status=1; fi
  return "$status"
}
trap restart_cms EXIT
systemctl stop empact-expiry.timer empact-expiry.service
systemctl stop empact-cms
# No credentials/config files in this archive. Back those up separately in a secret store.
tar -C /srv/empact --exclude=data/site/publish.lock -czf "$archive" data
sha256sum "$archive" > "$archive.sha256"
tar -tzf "$archive" >/dev/null
# Restore services before the heavier integrity check and retention pass.
restart_cms
trap - EXIT
# Only managed full archives participate in the one-recovery-point policy.
if [[ "$backup_dir" == /srv/empact/backups || "$backup_dir" == /srv/empact/backups/* ]]; then
  /usr/local/lib/empact/backup-retention.py "$archive"
fi
printf 'Backup completed: %s\n' "$archive"
