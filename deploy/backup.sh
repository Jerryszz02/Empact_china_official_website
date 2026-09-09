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
  if $was_active; then systemctl start empact-cms; fi
  if $timer_active; then systemctl start empact-expiry.timer; fi
}
trap restart_cms EXIT
systemctl stop empact-expiry.timer empact-expiry.service
systemctl stop empact-cms
# No credentials/config files in this archive. Back those up separately in a secret store.
tar -C /srv/empact --exclude=data/site/publish.lock -czf "$archive" data
sha256sum "$archive" > "$archive.sha256"
tar -tzf "$archive" >/dev/null
printf 'Backup completed: %s\n' "$archive"
