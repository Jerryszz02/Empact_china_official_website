#!/usr/bin/env bash
# Explicit maintenance, only after this code release has passed CI and deployed.
set -Eeuo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Run as root.' >&2; exit 2; }
source_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
current=$(readlink -e /srv/empact/code/current)
[[ $current =~ ^/srv/empact/code/[a-f0-9]{40}$ ]] || exit 2
# A compatible application must already be live before changing its identity.
cmp "$source_dir/../apps/cms/src/public-permissions.ts" "$current/apps/cms/src/public-permissions.ts"
cmp "$source_dir/../apps/cms/src/build-workspace.ts" "$current/apps/cms/src/build-workspace.ts"
[[ ! -e /etc/empact/runtime-isolation.enabled ]] || { echo 'Isolation already enabled.'; exit 0; }
[[ -x /usr/local/lib/empact/secure-runtime.py ]] || { echo 'Install reviewed deployment tools first.' >&2; exit 2; }
for helper in deploy.sh restore.sh secure-runtime.py; do
  cmp "$source_dir/$helper" "/usr/local/lib/empact/$helper"
done
for unit in empact-cms.service empact-public.service empact-expiry.service; do systemd-analyze verify "$source_dir/$unit"; done
exec 8>/run/lock/empact-actions.lock
flock -n 8 || exit 75
exec 9>/run/lock/empact-deploy.lock
flock -n 9 || exit 75
if systemctl is-active --quiet empact-backup.service; then exit 75; fi
systemctl is-active --quiet empact-cms.service
systemctl is-active --quiet empact-public.service
# Save credentials/ACL privately and outside the independently managed backup retention.
install -d -m 700 /srv/empact/security-migrations
record=$(mktemp -d /srv/empact/security-migrations/isolation-XXXXXXXX)
cache="$current/apps/cms/.next/cache"
[[ ! -L "$cache" ]] || { echo "Unexpected existing cache link" >&2; exit 2; }
cp -a /etc/empact/website.env "$record/website.env"
had_public=false
if [[ -e /etc/empact/public.env ]]; then cp -a /etc/empact/public.env "$record/prior-public.env"; had_public=true; fi
for unit in empact-cms.service empact-public.service empact-expiry.service; do
  cp -a "/etc/systemd/system/$unit" "$record/$unit"
done
getfacl -R -p "$current" /srv/empact/data > "$record/permissions.acl"
timer=false
systemctl is-active --quiet empact-expiry.timer && timer=true || true
lock_token="isolation-$$"
/usr/local/lib/empact/publication-lock.py acquire /srv/empact/data/site "$lock_token"
locked=true
stopped=false
recover() {
  status=$?
  trap - EXIT
  set +e
  if (( status != 0 )); then
    if $stopped; then systemctl stop empact-cms.service empact-public.service empact-expiry.service; fi
    cp -a "$record/website.env" /etc/empact/website.env
    if $had_public; then cp -a "$record/prior-public.env" /etc/empact/public.env; else rm -f /etc/empact/public.env; fi
    for unit in empact-cms.service empact-public.service empact-expiry.service; do cp -a "$record/$unit" "/etc/systemd/system/$unit"; done
    if [[ -L "$cache" && $(readlink "$cache") == "/srv/empact/cache/next/${current##*/}" ]]; then
      destination=$(readlink "$cache")
      rm -- "$cache"
      mv -- "$destination" "$cache"
    fi
    setfacl --restore="$record/permissions.acl" || true
    # Keep newly created groups/cache for diagnosis; never restore application data.
    rm -f /etc/empact/runtime-isolation.enabled
    systemctl daemon-reload || true
  fi
  if $locked; then /usr/local/lib/empact/publication-lock.py release /srv/empact/data/site "$lock_token" || true; fi
  if $stopped; then systemctl start empact-public.service empact-cms.service || true; fi
  if $timer; then systemctl start empact-expiry.timer || true; fi
  if (( status != 0 )); then echo "Isolation failed; configuration rollback attempted. Inspect $record" >&2; fi
  exit "$status"
}
trap recover EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
stopped=true
systemctl stop empact-expiry.timer empact-expiry.service empact-cms.service empact-public.service
getent group empact-public >/dev/null || groupadd --system empact-public
if ! id empact-public >/dev/null 2>&1; then
  useradd --system --gid empact-public --no-create-home --home-dir /nonexistent --shell /sbin/nologin empact-public
fi
# Refuse an existing login-capable or privileged account with this name.
[[ $(id -u empact-public) != 0 && $(id -gn empact-public) == empact-public ]]
[[ $(getent passwd empact-public | cut -d: -f7) == /sbin/nologin ]]
[[ $(id -G empact-public) == "$(getent group empact-public | cut -d: -f3)" ]]
usermod -a -G empact-public empact
gid=$(getent group empact-public | cut -d: -f3)
/usr/bin/node "$source_dir/public-environment.mjs" /etc/empact/website.env "$record/public.env"
install -o root -g root -m 600 "$record/public.env" /etc/empact/public.env
printf '\nPUBLIC_READER_GID=%s\n' "$gid" >> /etc/empact/website.env
chown root:empact /etc/empact/website.env
chmod 640 /etc/empact/website.env
/usr/local/lib/empact/secure-runtime.py "$current"
chgrp empact-public /srv/empact/data
chmod 0710 /srv/empact/data
(cd "$current" && runuser -u empact -- /usr/bin/node --env-file=/etc/empact/website.env --import tsx apps/cms/src/cli/repair-public-permissions.ts)
for unit in empact-cms.service empact-public.service empact-expiry.service; do
  install -o root -g root -m 644 "$source_dir/$unit" "/etc/systemd/system/$unit"
done
# The installer must fail closed before changing a live pointer if a future
# artifact lacks support for immutable builds.
install -o root -g root -m 600 /dev/null /etc/empact/runtime-isolation.enabled
systemctl daemon-reload
/usr/local/lib/empact/publication-lock.py release /srv/empact/data/site "$lock_token"
locked=false
systemctl start empact-public.service empact-cms.service
[[ $(systemctl show empact-public.service -p User --value) == empact-public ]]
[[ $(systemctl show empact-public.service -p Group --value) == empact-public ]]
[[ $(systemctl show empact-public.service -p EnvironmentFiles --value) == "/etc/empact/public.env (ignore_errors=no)" ]]
curl -fsS --retry 20 --retry-connrefused --retry-delay 2 --max-time 15 -o /dev/null http://127.0.0.1:3000/admin/login
curl -fsS --max-time 15 -o /dev/null http://127.0.0.1:4322/release.json
# Real identities must both allow necessary reads and reject private access.
runuser -u empact-public -- test -r /srv/empact/data/site/current/index.html
runuser -u empact-public -- test -r /srv/empact/data/site/current/.recruitment.json
if runuser -u empact-public -- test -r /srv/empact/data/cms.db; then exit 1; fi
if runuser -u empact-public -- test -r /etc/empact/website.env; then exit 1; fi
if runuser -u empact-public -- test -r "$(readlink -e /srv/empact/data/site/current)/../snapshot.json"; then exit 1; fi
if runuser -u empact -- test -w "$current/apps/cms/src/publisher.ts"; then exit 1; fi
if runuser -u empact -- test -w /srv/empact/code; then exit 1; fi
curl -fsS --max-time 20 -o /dev/null https://empact.cn/release.json
curl -fsS --max-time 20 -o /dev/null https://chatcircle.empact.cn/api/cc/health
$timer && systemctl start empact-expiry.timer || true
trap - EXIT
printf 'Isolation enabled. Private rollback evidence: %s\n' "$record"
