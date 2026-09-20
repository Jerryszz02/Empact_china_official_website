#!/usr/bin/env bash
# Trusted root installer. It is installed separately as /usr/local/lib/empact/deploy.sh.
set -Eeuo pipefail
umask 077

readonly SHA_RE='^[0-9a-f]{40}$'
readonly ROOT=/srv/empact
readonly CODE_ROOT=$ROOT/code
readonly CURRENT=$CODE_ROOT/current
readonly SITE_RUNTIME=$ROOT/data/site
readonly PUBLIC_CURRENT=$SITE_RUNTIME/current
readonly ENV_FILE=/etc/empact/website.env
readonly BACKUP=/usr/local/lib/empact/backup.sh
readonly AUTO_UPDATE=/usr/local/lib/empact/auto-update.py
readonly PUBLICATION_LOCK=/usr/local/lib/empact/publication-lock.py
readonly REPO=Jerryszz02/Empact_china_official_website
readonly BUILD_HEAP_MB=${EMPACT_BUILD_HEAP_MB:-768}

[[ ${EUID} -eq 0 ]] || { echo 'must run as root' >&2; exit 2; }
[[ $# -eq 1 && $1 =~ $SHA_RE ]] || { echo 'Usage: deploy.sh <full 40-character commit SHA>' >&2; exit 2; }
sha=$1
install -d -o root -g root -m 755 "$CODE_ROOT"
install -d -o root -g root -m 700 "$ROOT/staging" "$ROOT/receipts" "$ROOT/backups"

exec 9>/run/lock/empact-deploy.lock
flock -n 9 || { echo 'another deployment is already running' >&2; exit 0; }

current_code=''
if [[ -e $CURRENT ]]; then current_code=$(readlink -f "$CURRENT"); fi
if [[ -n $current_code && $(basename "$current_code") == "$sha" ]]; then
  echo "already deployed: $sha"
  exit 0
fi

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$ROOT/staging/$sha.tar.gz"
candidate="$CODE_ROOT/$sha"
tmp="$ROOT/staging/$sha.$$.tmp"
rm -f "$archive"
curl --fail --location --silent --show-error --retry 2 \
  --connect-timeout 15 --max-time 300 \
  "https://codeload.github.com/$REPO/tar.gz/$sha" -o "$archive"

# Validate and extract as one operation. Reject links and special files because
# they can escape the staging directory when an archive is not GitHub-generated.
rm -rf "$tmp"
install -d -o root -g root -m 700 "$tmp"
archive="$archive" extract_dir="$tmp" python3 - <<'PY'
import os, sys, tarfile
archive = os.environ["archive"]
destination = os.environ["extract_dir"]
with tarfile.open(archive, "r:gz") as bundle:
    members = bundle.getmembers()
    roots = set()
    for member in members:
        name = member.name
        while name.startswith("./"):
            name = name[2:]
        parts = name.split("/")
        if not name or name.startswith("/") or ".." in parts:
            raise SystemExit(f"unsafe archive path: {member.name}")
        roots.add(parts[0])
        if member.issym() or member.islnk() or not (member.isdir() or member.isfile()):
            raise SystemExit(f"unsafe archive entry: {member.name}")
    if len(roots) != 1:
        raise SystemExit("archive must contain exactly one top-level directory")
    bundle.extractall(destination, members=members)
    root = next(iter(roots))
source_dir = os.path.join(destination, root)
if not os.path.isfile(os.path.join(source_dir, "package.json")) or not os.path.isdir(os.path.join(source_dir, "apps", "cms")):
    raise SystemExit("archive is not a website source tree")
PY
source_dir=$(find "$tmp" -mindepth 1 -maxdepth 1 -type d -print -quit)
[[ -n $source_dir ]] || { echo 'archive extraction produced no source directory' >&2; exit 1; }
printf '%s\n' "$sha" > "$source_dir/.code-revision"
chown -R empact:empact "$source_dir"
chmod 600 "$source_dir/.code-revision"
if [[ -e $candidate ]]; then
  [[ -f "$candidate/.code-revision" ]] && [[ $(<"$candidate/.code-revision") == "$sha" ]] || {
    echo "immutable release directory exists with a different revision: $candidate" >&2
    exit 1
  }
  rm -rf "$tmp"
else
  mv "$source_dir" "$candidate"
  rm -rf "$tmp"
fi

schema_manifest() {
  local root_dir=$1 file
  for file in \
    apps/cms/payload.config.ts \
    apps/cms/src/collections.ts \
    apps/cms/src/payload-types.ts; do
    if [[ -f "$root_dir/$file" ]]; then
      (cd "$root_dir" && sha256sum "$file")
    else
      printf 'missing  %s\n' "$file"
    fi
  done
  python3 - "$root_dir/apps/cms/package.json" <<'PYDEPS'
import json, sys
with open(sys.argv[1]) as package:
    dependencies = json.load(package)["dependencies"]
for name in ("payload", "@payloadcms/db-sqlite"):
    print(name + "=" + dependencies[name])
PYDEPS
  if [[ -d "$root_dir/apps/cms/src/migrations" ]]; then
    (cd "$root_dir" && find apps/cms/src/migrations -type f -print0 | sort -z | xargs -0 -r sha256sum)
  fi
}
if [[ -n $current_code && -d $current_code ]]; then
  if ! diff -u <(schema_manifest "$current_code") <(schema_manifest "$candidate"); then
    echo 'CMS schema files changed; automatic deployment is fail-closed.' >&2
    exit 1
  fi
fi

was_cms=false; was_expiry=false; was_timer=false; was_public=false
systemctl is-active --quiet empact-cms && was_cms=true || true
systemctl is-active --quiet empact-expiry.service && was_expiry=true || true
systemctl is-active --quiet empact-expiry.timer && was_timer=true || true
systemctl is-active --quiet empact-public.service && was_public=true || true
previous_public=''
previous_code=$current_code
maintenance=false
lock_token="deploy-$sha-$$"

restore_pointer() {
  local link=$1
  local target=$2
  local next="${link}.rollback.$$"
  [[ -n $target ]] || return 0
  ln -s "$target" "$next"
  mv -Tf "$next" "$link"
}
restore_services() {
  if $was_public; then
    systemctl restart empact-public.service || true
  else
    systemctl stop empact-public.service || true
  fi
  $was_cms && systemctl start empact-cms.service || true
  $was_expiry && systemctl start empact-expiry.service || true
  $was_timer && systemctl start empact-expiry.timer || true
}
wait_for() {
  local url=$1 i
  for i in {1..30}; do
    if curl --fail --silent --show-error --max-time 5 "$url" >/tmp/empact-health.$$; then
      cat /tmp/empact-health.$$
      rm -f /tmp/empact-health.$$
      return 0
    fi
    sleep 2
  done
  rm -f /tmp/empact-health.$$
  return 1
}
rollback() {
  local status=${1:-1}
  trap - EXIT ERR TERM
  "$PUBLICATION_LOCK" release "$SITE_RUNTIME" "$lock_token" || true
  if ! $maintenance; then
    exit "$status"
  fi
  systemctl stop empact-cms.service || true
  if [[ -n $previous_code ]]; then restore_pointer "$CURRENT" "$previous_code" || true; fi
  if [[ -n $previous_public ]]; then restore_pointer "$PUBLIC_CURRENT" "$previous_public" || true; fi
  restore_services
  echo "deployment failed; restored previous pointers" >&2
  exit "$status"
}
trap 'status=$?; if (( status != 0 )); then rollback "$status"; fi' EXIT
trap 'exit 143' TERM

runuser -u empact -- env npm_config_include=dev npm ci --prefix "$candidate" --no-audit --no-fund
runuser -u empact -- env NODE_OPTIONS="--max-old-space-size=$BUILD_HEAP_MB" NODE_ENV=production \
  CMS_DEV_SCHEMA_PUSH=false REPOSITORY_DIR="$candidate" SITE_CODE_REVISION="$sha" \
  /usr/bin/node --env-file="$ENV_FILE" /usr/bin/npm run build:cms --prefix "$candidate"

# Re-read main and its latest successful check after the potentially long build.
[[ -x $AUTO_UPDATE ]] || { echo "trusted gate not installed: $AUTO_UPDATE" >&2; exit 1; }
"$AUTO_UPDATE" --check-only --expected-sha "$sha"
[[ -x $BACKUP ]] || { echo "trusted backup not installed: $BACKUP" >&2; exit 1; }
backup_dir="$ROOT/backups/auto-$sha-$timestamp"

# Wait for any editor/expiry publication and block new publications before either
# CMS stop. The backup sees inactive services and therefore cannot restart them.
[[ -x $PUBLICATION_LOCK ]] || { echo 'trusted publication lock helper not installed' >&2; exit 1; }
"$PUBLICATION_LOCK" acquire "$SITE_RUNTIME" "$lock_token"
maintenance=true
systemctl stop empact-expiry.timer empact-expiry.service empact-cms.service
if [[ -e $PUBLIC_CURRENT ]]; then previous_public=$(readlink -f "$PUBLIC_CURRENT"); fi
"$BACKUP" "$backup_dir"
"$PUBLICATION_LOCK" release "$SITE_RUNTIME" "$lock_token"
cd "$candidate"
runuser -u empact -- env NODE_ENV=production REPOSITORY_DIR="$candidate" SITE_CODE_REVISION="$sha" \
  RUNTIME_DIR="$SITE_RUNTIME" MEDIA_DIR="$ROOT/data/media" PUBLIC_HEALTH_URL=http://127.0.0.1:4322/release.json \
  /usr/bin/node --env-file="$ENV_FILE" --import tsx "$candidate/apps/cms/src/cli/deploy-current.ts"

restore_pointer "$CURRENT" "$candidate"
systemctl restart empact-public.service
systemctl start empact-cms.service
wait_for http://127.0.0.1:4322/release.json | grep -F '"codeRevision":"'$sha'"'
wait_for https://empact.cn/release.json | grep -F '"codeRevision":"'$sha'"'
wait_for http://127.0.0.1:3000/admin/ >/dev/null
wait_for https://chatcircle.empact.cn/api/cc/health >/dev/null
$was_timer && systemctl start empact-expiry.timer || true
receipt="$ROOT/receipts/deploy-$timestamp-$sha.json"
printf '{"sha":"%s","previousCode":"%s","previousPublic":"%s","deployedAt":"%s"}\n' \
  "$sha" "$previous_code" "$previous_public" "$timestamp" > "$receipt"
trap - EXIT ERR TERM
echo "deployment completed: $sha"
