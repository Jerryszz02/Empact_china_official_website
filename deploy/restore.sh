#!/usr/bin/env bash
# Explicit operator restore. The current data directory is retained for reversal.
set -euo pipefail
umask 077
verify_archive_checksum() {
  local archive=$1 expected actual
  [[ "$archive" = /* && -f "$archive" && -f "$archive.sha256" ]] || { echo 'Archive and checksum required.' >&2; return 2; }
  expected=$(awk 'NF {print $1; exit}' "$archive.sha256")
  [[ "$expected" =~ ^[[:xdigit:]]{64}$ ]] || { echo 'Invalid checksum sidecar.' >&2; return 2; }
  actual=$(sha256sum "$archive" | awk '{print $1}')
  [[ "$actual" == "$expected" ]] || { echo 'Archive checksum mismatch.' >&2; return 1; }
}
main() {
if [[ $# -ne 2 || "$2" != '--confirm-restore' ]]; then echo 'Usage: sudo deploy/restore.sh /absolute/backup.tar.gz --confirm-restore' >&2; exit 2; fi
archive=$1
[[ "$archive" = /* && -f "$archive" && -f "$archive.sha256" ]] || { echo 'Archive and checksum required.' >&2; exit 2; }
verify_archive_checksum "$archive"
# Reject traversal and unexpected roots before extracting trusted operator backup.
if tar -tzf "$archive" | awk '$0 !~ /^data\// || $0 ~ /(^|\/)\.\.(\/|$)/ {bad=1} END {exit !bad}'; then echo 'Unsafe archive paths.' >&2; exit 1; fi
stage=$(mktemp -d /srv/empact/restore.XXXXXX)
tar --no-same-owner -xzf "$archive" -C "$stage"
[[ -d "$stage/data" ]] || exit 1
timer_active=false
if systemctl is-active --quiet empact-expiry.timer; then timer_active=true; fi
systemctl stop empact-expiry.timer empact-expiry.service
systemctl stop empact-cms empact-public
previous="/srv/empact/data.before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
switched=false
recover() {
  code=$?
  if [[ $code -ne 0 ]] && $switched; then
    systemctl stop empact-cms empact-public || true
    if [[ -e /srv/empact/data ]]; then mv /srv/empact/data "$stage/failed-data"; fi
    mv "$previous" /srv/empact/data
    systemctl start empact-cms empact-public || true
    echo 'Restore failed; previous data restored.' >&2
  fi
  if $timer_active; then systemctl start empact-expiry.timer; fi
  exit "$code"
}
trap recover EXIT
mv /srv/empact/data "$previous"
switched=true
mv "$stage/data" /srv/empact/data
chown -R empact:empact /srv/empact/data
systemctl start empact-cms empact-public
curl --fail --silent --retry 10 --retry-connrefused --retry-delay 1 --max-time 15 http://127.0.0.1:4322/release.json
curl --fail --silent --retry 10 --retry-connrefused --retry-delay 1 --max-time 15 http://127.0.0.1:3000/admin/login >/dev/null
printf '\nRestore complete; prior data retained at %s\n' "$previous"
}
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
