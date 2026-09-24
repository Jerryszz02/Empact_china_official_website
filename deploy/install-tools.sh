#!/usr/bin/env bash
# Explicit operator action, from a reviewed checkout; never run by website code.
set -Eeuo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Run the reviewed installer as root.' >&2; exit 2; }
source_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
destination=/usr/local/lib/empact
files=(backup.sh restore.sh auto-update.py publication-lock.py prune-build-cache.py schema-plan.py runtime-artifact.py deploy.sh actions-command.py)
for file in "${files[@]}"; do
  [[ -f "$source_dir/$file" && ! -L "$source_dir/$file" ]] || exit 1
  if [[ $file == *.sh ]]; then bash -n "$source_dir/$file"; else
    python3 -c 'import ast,sys; ast.parse(open(sys.argv[1]).read())' "$source_dir/$file"
  fi
done
systemd-analyze verify "$source_dir/empact-release@.service"
exec 8>/run/lock/empact-actions.lock
flock -n 8 || { echo 'An Actions upload/deployment is active; wait before upgrading.' >&2; exit 75; }
exec 9>/run/lock/empact-deploy.lock
flock -n 9 || { echo 'A deployment is active; wait before upgrading.' >&2; exit 75; }
install -d -o root -g root -m 0755 "$destination"
backup=$(mktemp -d /srv/empact/backups/installer-upgrade-XXXXXXXX)
for file in "${files[@]}"; do
  if [[ -f "$destination/$file" ]]; then cp -p "$destination/$file" "$backup/"; fi
done
if [[ -f /etc/systemd/system/empact-release@.service ]]; then cp -p /etc/systemd/system/empact-release@.service "$backup/"; fi
if [[ -f "$destination/installed.sha256" ]]; then cp -p "$destination/installed.sha256" "$backup/"; fi
recover_upgrade() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    for file in "${files[@]}" installed.sha256; do
      if [[ -f "$backup/$file" ]]; then cp -p "$backup/$file" "$destination/$file"; else rm -f "$destination/$file"; fi
    done
    if [[ -f "$backup/empact-release@.service" ]]; then
      cp -p "$backup/empact-release@.service" /etc/systemd/system/empact-release@.service
    else
      rm -f /etc/systemd/system/empact-release@.service
    fi
    systemctl daemon-reload || true
    echo "Installer upgrade failed; restored previous tools from $backup" >&2
  fi
  exit "$status"
}
trap recover_upgrade EXIT
for file in "${files[@]}"; do install -o root -g root -m 0755 "$source_dir/$file" "$destination/$file"; done
install -o root -g root -m 0644 "$source_dir/empact-release@.service" /etc/systemd/system/empact-release@.service
(cd "$destination" && sha256sum "${files[@]}") >"$destination/installed.sha256"
systemctl daemon-reload
systemd-analyze verify /etc/systemd/system/empact-release@.service
if systemctl cat empact-deploy.timer >/dev/null 2>&1; then
  systemctl disable --now empact-deploy.timer
fi
(cd "$destination" && sha256sum -c installed.sha256)
trap - EXIT
echo "Trusted installer updated; previous tools retained in $backup"
