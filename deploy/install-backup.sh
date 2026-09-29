#!/usr/bin/env bash
# Install the reviewed backup scheduler and retention pair; preserve other tools.
set -Eeuo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Run as root.' >&2; exit 2; }
source_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
destination=/usr/local/lib/empact
for script in monthly-backup.py backup-retention.py; do
  python3 -c 'import ast,sys; ast.parse(open(sys.argv[1]).read())' "$source_dir/$script"
done
bash -n "$source_dir/backup.sh"
# Refuse unexpected prerequisites instead of replacing live deployment tools.
exec 9>/run/lock/empact-deploy.lock
flock -n 9 || { echo 'Deployment or backup active; retry when idle.' >&2; exit 75; }
! systemctl is-active --quiet empact-backup.service || { echo 'Backup active.' >&2; exit 75; }
# Validate the existing trust baseline under the lock, before any mutation.
(cd "$destination" && sha256sum -c installed.sha256)
cmp "$source_dir/publication-lock.py" "$destination/publication-lock.py"
backup=$(mktemp -d /srv/empact/backups/monthly-installer-XXXXXXXX)
files=("$destination/monthly-backup.py" "$destination/backup-retention.py" "$destination/backup.sh" "$destination/installed.sha256" /etc/systemd/system/empact-backup.service /etc/systemd/system/empact-backup.timer)
was_enabled=false; was_active=false
systemctl is-enabled --quiet empact-backup.timer 2>/dev/null && was_enabled=true || true
systemctl is-active --quiet empact-backup.timer && was_active=true || true
for file in "${files[@]}"; do
  if [[ -f "$file" ]]; then cp -p "$file" "$backup/"; fi
done
recover() {
  status=$?
  trap - EXIT
  if (( status != 0 )); then
    systemctl disable --now empact-backup.timer || true
    for file in "${files[@]}"; do
      if [[ -f "$backup/${file##*/}" ]]; then cp -p "$backup/${file##*/}" "$file"; else rm -f "$file"; fi
    done
    systemctl daemon-reload || true
    if $was_enabled; then systemctl enable empact-backup.timer || true; fi
    if $was_active; then systemctl start empact-backup.timer || true; fi
  fi
  exit "$status"
}
trap recover EXIT
for script in monthly-backup.py backup-retention.py backup.sh; do
  install -o root -g root -m 0755 "$source_dir/$script" "$destination/$script"
done
# Preserve all untouched checksums verbatim; only these two tools are replaced.
awk '$2 != "backup.sh" && $2 != "backup-retention.py" {print}' "$backup/installed.sha256" > "$backup/new-installed.sha256"
(cd "$destination" && sha256sum backup.sh backup-retention.py) >> "$backup/new-installed.sha256"
install -o root -g root -m 0600 "$backup/new-installed.sha256" "$destination/installed.sha256"
(cd "$destination" && sha256sum -c installed.sha256)
for unit in empact-backup.service empact-backup.timer; do
  install -o root -g root -m 0644 "$source_dir/$unit" "/etc/systemd/system/$unit"
done
systemd-analyze verify /etc/systemd/system/empact-backup.service /etc/systemd/system/empact-backup.timer
systemctl daemon-reload
systemctl enable --now empact-backup.timer
sha256sum "${files[@]}" > "$destination/monthly-backup.sha256"
trap - EXIT
echo "Monthly backup timer installed; previous files: $backup"
