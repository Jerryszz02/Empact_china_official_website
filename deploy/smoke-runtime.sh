#!/usr/bin/env bash
# CI-only acceptance of the exact archive after moving it out of the checkout.
set -Eeuo pipefail
[[ $# == 1 && -f $1 ]] || { echo 'Usage: smoke-runtime.sh runtime.tar.gz' >&2; exit 2; }
archive=$(realpath "$1")
work=$(mktemp -d)
server=''
cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n $server ]]; then kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true; fi
  if (( status != 0 )); then tail -80 "$work/cms.log" 2>/dev/null || true; fi
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT
mkdir "$work/runtime" "$work/data" "$work/data/media" "$work/data/site"
tar -xzf "$archive" -C "$work/runtime"
cd "$work/runtime"
export NODE_ENV=production CMS_DEV_SCHEMA_PUSH=false NEXT_TELEMETRY_DISABLED=1 ASTRO_TELEMETRY_DISABLED=1
export PAYLOAD_SECRET
PAYLOAD_SECRET=$(node -e 'process.stdout.write(require("node:crypto").randomBytes(48).toString("hex"))')
export DATABASE_URL="file:$work/data/cms.db" MEDIA_DIR="$work/data/media" RUNTIME_DIR="$work/data/site"
export REPOSITORY_DIR="$work/runtime" CMS_URL=http://127.0.0.1:4321
node -e 'const s=require("node:net").createServer();s.on("error",()=>process.exit(1));s.listen(4321,"127.0.0.1",()=>s.close())'
# A fresh private fixture database proves the built CMS uses runtime settings.
(cd apps/cms && node --import tsx payload.mjs migrate) >"$work/cms.log" 2>&1
(cd apps/cms && exec node ../../node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 4321) >>"$work/cms.log" 2>&1 &
server=$!
ready=false
for attempt in {1..60}; do
  kill -0 "$server" 2>/dev/null || break
  if curl -fsS --max-time 3 "$CMS_URL/admin/login" >"$work/login.html"; then ready=true; break; fi
  sleep 1
done
$ready || { echo 'Relocated CMS did not become healthy.' >&2; exit 1; }
grep -qi '<html' "$work/login.html"
kill "$server"
wait "$server" || true
server=''
# CMS publication still needs Astro/tsx and their native runtime dependencies.
npm run build:preview
SITE_MODE=preview npm run check:output
echo 'Relocated CMS and content publisher passed without npm ci or build:cms.'
