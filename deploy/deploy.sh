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
readonly PRUNE_BUILD_CACHE=/usr/local/lib/empact/prune-build-cache.py
readonly SCHEMA_PLAN=/usr/local/lib/empact/schema-plan.py
readonly RUNTIME_ARTIFACT=/usr/local/lib/empact/runtime-artifact.py
readonly MIN_FREE_KB=${EMPACT_MIN_FREE_KB:-3145728}
readonly MIN_FREE_INODES=${EMPACT_MIN_FREE_INODES:-150000}

check_disk_space() {
  local available_kb available_inodes additional_kb=${1:-0} required_kb
  [[ "$MIN_FREE_KB" =~ ^[1-9][0-9]*$ && "$MIN_FREE_INODES" =~ ^[1-9][0-9]*$ ]] || {
    echo 'Disk headroom thresholds must be positive integers.' >&2
    return 1
  }
  available_kb=$(df -Pk "$ROOT" | awk 'NR==2 {print $4}')
  available_inodes=$(df -Pi "$ROOT" | awk 'NR==2 {print $4}')
  [[ "$available_kb" =~ ^[0-9]+$ && "$available_inodes" =~ ^[0-9]+$ ]] || {
    echo 'Cannot determine deployment filesystem headroom.' >&2
    return 1
  }
  [[ "$additional_kb" =~ ^[0-9]+$ ]] || return 1
  required_kb=$((MIN_FREE_KB + additional_kb))
  if (( available_kb < required_kb || available_inodes < MIN_FREE_INODES )); then
    echo "Insufficient deployment disk headroom: available ${available_kb} KiB / ${available_inodes} inodes; required ${required_kb} KiB / ${MIN_FREE_INODES} inodes. Deployment stopped for capacity; inspect the reported phase and retention plan before retrying." >&2
    return 1
  fi
  echo "Deployment disk headroom: ${available_kb} KiB / ${available_inodes} inodes available."
}

cleanup_failed_preparation() {
  cd "$ROOT"
  rm -f "$archive" "$artifact_metadata"
  if [[ -n $tmp && -d $tmp && ! -L $tmp ]]; then rm -rf "$tmp"; fi
  if $candidate_created && [[ "$candidate" != "$current_code" && ! -L "$candidate" && -f "$candidate/.code-revision" ]]; then
    # Never delete a candidate still serving requests after a failed rollback.
    if [[ $(readlink -f "$CURRENT" || true) != "$candidate" && $(<"$candidate/.code-revision") == "$sha" ]]; then
      candidate="$candidate" helper_path="$PRUNE_BUILD_CACHE" python3 - <<'CLEANUP'
import importlib.util, os, shutil
from pathlib import Path
spec = importlib.util.spec_from_file_location("prune", os.environ["helper_path"])
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
path = Path(os.environ["candidate"])
helper.release(path.parent, path.name)
if path.name in helper.active_revisions(path.parent, Path("/proc")):
    raise SystemExit("Failed candidate is still referenced; preserved for inspection")
if not shutil.rmtree.avoids_symlink_attacks:
    raise SystemExit("Safe removal is unavailable")
shutil.rmtree(str(path))
CLEANUP
    fi
  fi
}

[[ ${EUID} -eq 0 ]] || { echo 'must run as root' >&2; exit 2; }
[[ $# -eq 1 && $1 =~ $SHA_RE ]] || { echo 'Usage: deploy.sh <full 40-character commit SHA>' >&2; exit 2; }
sha=$1
exec 9>/run/lock/empact-deploy.lock
flock -n 9 || { echo 'another deployment is already running' >&2; exit 75; }

# Initialize attempt ownership and traps before preparation can write anything.
current_code=''
if [[ -e $CURRENT ]]; then current_code=$(readlink -f "$CURRENT"); fi
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$ROOT/staging/artifact-$sha.zip"
artifact_metadata="$ROOT/staging/artifact-$sha.json"
candidate="$CODE_ROOT/$sha"
candidate_created=false
tmp="$ROOT/staging/$sha.$$.tmp"
was_cms=false; was_expiry=false; was_timer=false; was_public=false
previous_public=''
previous_code=$current_code
maintenance=false
publication_locked=false
committed=false
backup_dir=''
backup_complete=false
phase=gate
lock_token="deploy-$sha-$$"
installer_revision=$(sha256sum "${BASH_SOURCE[0]}" | awk '{print $1}')

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
finish() {
  local status=$?
  trap - EXIT TERM INT
  if (( status != 0 )) && ! $committed; then
    if $maintenance; then
      systemctl stop empact-expiry.timer empact-expiry.service empact-cms.service || true
      if [[ -n $previous_code ]]; then restore_pointer "$CURRENT" "$previous_code" || true; fi
      if [[ -n $previous_public ]]; then restore_pointer "$PUBLIC_CURRENT" "$previous_public" || true; fi
    fi
    if $publication_locked; then "$PUBLICATION_LOCK" release "$SITE_RUNTIME" "$lock_token" || true; fi
    $maintenance && restore_services
    # Additive schema remains compatible; never restore a DB over new CMS edits.
    cleanup_failed_preparation || echo 'Attempt cleanup incomplete; inspect retained paths.' >&2
    echo "deployment failed: phase=$phase sha=$sha installer=$installer_revision status=$status" >&2
    if [[ -d $ROOT/receipts ]]; then
      printf '{"sha":"%s","phase":"%s","status":%s,"installer":"%s","failedAt":"%s","backupDir":"%s","backupComplete":%s}\n' \
        "$sha" "$phase" "$status" "$installer_revision" "$timestamp" "$backup_dir" "$backup_complete" > "$ROOT/receipts/failed-$timestamp-$sha.json" || true
    fi
  else
    rm -f "$archive" "$artifact_metadata" || echo 'Artifact cleanup incomplete.' >&2
  fi
  exit "$status"
}
trap finish EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

echo "deployment start: sha=$sha installer=$installer_revision"
[[ -x $AUTO_UPDATE && -x $RUNTIME_ARTIFACT && -x $PRUNE_BUILD_CACHE ]] || {
  echo 'Trusted runtime installer helpers are not installed as a compatible set.' >&2; exit 1;
}
"$AUTO_UPDATE" --check-only --expected-sha "$sha" --current "$CURRENT"
install -d -o root -g root -m 755 "$CODE_ROOT"
install -d -o root -g root -m 700 "$ROOT/staging" "$ROOT/receipts" "$ROOT/backups"
if [[ -n $current_code && $(basename "$current_code") == "$sha" ]]; then
  echo "already deployed: $sha"
  exit 0
fi

phase=prepare
"$PRUNE_BUILD_CACHE" "$sha" --phase prepare --apply --lock-fd 9
check_disk_space
[[ ! -e $candidate && ! -L $candidate ]] || { echo 'Candidate already exists; retry through the Actions upload entrypoint.' >&2; exit 1; }
[[ ! -e $tmp && ! -L $tmp ]] || { echo 'Attempt directory already exists.' >&2; exit 1; }
install -d -o root -g root -m 700 "$tmp"
phase=extract
"$RUNTIME_ARTIFACT" extract "$sha" "$tmp"
chown -R empact:empact "$tmp"
mv "$tmp" "$candidate"
candidate_created=true
check_disk_space
# Load the actual native dependencies on ECS before stopping healthy services.
phase=runtime
(cd "$candidate" && runuser -u empact -- /usr/bin/node --input-type=module -e '
  const { default: sharp } = await import("sharp");
  await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer();
  const { createClient } = await import("@libsql/client");
  const client = createClient({ url: "file::memory:" });
  await client.execute("SELECT 1");
  client.close();
  const esbuild = await import("esbuild");
  esbuild.transformSync("const value: number = 1", { loader: "ts" });
')

# Reviewed plans travel with code, so ordinary additive changes need no server
# environment override. Validate the exact installed -> candidate chain before
# stopping any service.
phase=schema
[[ -x $SCHEMA_PLAN ]] || { echo 'trusted schema plan helper is not installed' >&2; exit 1; }
schema_plan_file="$ROOT/staging/schema-$sha-$timestamp.json"
schema_changed=false
if [[ -n $current_code && -d $current_code ]]; then
  "$SCHEMA_PLAN" check "$current_code" "$candidate" "$schema_plan_file"
  if [[ $("$SCHEMA_PLAN" fingerprint "$current_code") != $("$SCHEMA_PLAN" fingerprint "$candidate") ]]; then
    schema_changed=true
  fi
fi

if $schema_changed; then
  command -v sqlite3 >/dev/null || { echo 'SQLite CLI is required for schema backup.' >&2; exit 1; }
  database_path=$(/usr/bin/node --env-file="$ENV_FILE" -e '
    const url = process.env.DATABASE_URL || "";
    if (!url.startsWith("file:/") || /[?#]/.test(url)) process.exit(1);
    console.log(url.slice(5));
  ')
  [[ ! -L "$database_path" ]] || { echo "Schema database must not be a symlink." >&2; exit 1; }
  database_path=$(readlink -e -- "$database_path")
  database_root=$(readlink -e -- "$ROOT/data")
  [[ "$database_path" == "$database_root/"* && -f "$database_path" ]] || {
    echo 'Schema migration requires an existing local database under /srv/empact/data.' >&2
    exit 1
  }
fi

# CI has already installed dependencies and built the CMS. ECS only verifies
# and unpacks that immutable runtime; production content is rendered below.
phase=schema
systemctl is-active --quiet empact-cms && was_cms=true || true
systemctl is-active --quiet empact-expiry.service && was_expiry=true || true
systemctl is-active --quiet empact-expiry.timer && was_timer=true || true
systemctl is-active --quiet empact-public.service && was_public=true || true

# Re-read main and its latest successful check after receiving the artifact.
# The target may remain valid while main advances normally; a removed target,
# failed rerun, or installed downgrade fails closed here.
"$AUTO_UPDATE" --check-only --pinned-sha "$sha" --current "$CURRENT"
[[ -x $BACKUP ]] || { echo "trusted backup not installed: $BACKUP" >&2; exit 1; }
backup_dir="$ROOT/backups/auto-$sha-$timestamp"

# Wait for any editor/expiry publication and block new publications before either
# CMS stop. The backup sees inactive services and therefore cannot restart them.
[[ -x $PUBLICATION_LOCK ]] || { echo 'trusted publication lock helper not installed' >&2; exit 1; }
phase=backup
# Allow an uncompressed backup plus database rehearsal copies and runtime margin.
backup_budget_kb=$(du -sk "$ROOT/data" | awk '{print $1}')
check_disk_space "$((backup_budget_kb * 2))"
"$PUBLICATION_LOCK" acquire "$SITE_RUNTIME" "$lock_token"
publication_locked=true
maintenance=true
systemctl stop empact-expiry.timer empact-expiry.service empact-cms.service
if [[ -e $PUBLIC_CURRENT ]]; then previous_public=$(readlink -f "$PUBLIC_CURRENT"); fi
"$BACKUP" "$backup_dir"
backup_complete=true
phase=migrate
if $schema_changed; then
  # Only create new tables/indexes. The helper rehearses on a private copy,
  # preserves existing rows/schema, and applies all statements transactionally.
  "$SCHEMA_PLAN" apply "$schema_plan_file" "$database_path" "$backup_dir/schema-before.db"
fi
"$PUBLICATION_LOCK" release "$SITE_RUNTIME" "$lock_token"
publication_locked=false
phase=publish
cd "$candidate"
runuser -u empact -- env NODE_ENV=production REPOSITORY_DIR="$candidate" SITE_CODE_REVISION="$sha" \
  RUNTIME_DIR="$SITE_RUNTIME" MEDIA_DIR="$ROOT/data/media" PUBLIC_HEALTH_URL=http://127.0.0.1:4322/release.json \
  /usr/bin/node --env-file="$ENV_FILE" --import tsx "$candidate/apps/cms/src/cli/deploy-current.ts"

phase=verify
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
committed=true
phase=cleanup
# The release is committed. Cleanup errors must not roll a healthy site back.
if ! "$PRUNE_BUILD_CACHE" "$sha" --phase complete --apply --lock-fd 9; then
  echo 'WARNING: deployment succeeded; retention cleanup needs operator attention.' >&2
fi
echo "deployment completed: $sha"
