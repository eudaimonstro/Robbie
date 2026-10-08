#!/usr/bin/env bash
# Start the image with its database from compose.yaml (no Caddy) and check what production
# depends on: it refuses to start misconfigured, migrates, answers its health check, and serves
# the web app with the right caching and CSP. CI runs it on every pull request; run it locally
# whenever the image or the compose file changes:
#   docker build -t robbie:local . && SMOKE_PORT=3201 bash deploy/smoke.sh robbie:local
set -euo pipefail

image="${1:?Usage: deploy/smoke.sh <image>}"
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
export ROBBIE_IMAGE="$image"
export ROBBIE_ENV_FILE="$work/robbie.env"
export SMOKE_PORT="${SMOKE_PORT:-3001}"
export BACKUP_DIR="$work/backups"
export BACKUP_OWNER="$(id -u):$(id -g)"
base="http://127.0.0.1:$SMOKE_PORT"
mkdir -p "$BACKUP_DIR"

# Throwaway values: the email key is never used, since nothing here signs in
cat >"$ROBBIE_ENV_FILE" <<'EOF'
POSTGRES_PASSWORD=smoketestonly
ACME_EMAIL=smoke@example.org
APP_URL=http://127.0.0.1
EMAIL_FROM=Robbie <noreply@example.org>
RESEND_API_KEY=re_smoke_test_only
SERVER_SECRET=smoke-test-only-secret-smoke-test-only
EOF

compose() {
  docker compose --project-name robbie-smoke --env-file "$ROBBIE_ENV_FILE" \
    -f "$here/compose.yaml" -f "$here/compose.ci.yaml" "$@"
}
fail() {
  echo "FAIL: $*" >&2
  exit 1
}
finish() {
  local status=$?
  if [ "$status" -ne 0 ]; then compose logs --no-color app db || true; fi
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$work"
  exit "$status"
}
trap finish EXIT

echo "== The image refuses to start misconfigured"
refuse() {
  local reason="$1"
  shift
  local out
  if out=$(docker run --rm --entrypoint node -e NODE_ENV=production "$@" "$image" dist/index.js 2>&1); then
    fail "it started with $reason"
  fi
  grep -q "$reason" <<<"$out" || fail "no word of $reason in: $out"
}
ready=(-e DATABASE_URL=postgresql://robbie:x@db:5432/robbie -e APP_URL=http://127.0.0.1
  -e EMAIL_FROM=noreply@example.org)
refuse ENABLE_TEST_AUTH "${ready[@]}" -e RESEND_API_KEY=re_x -e ENABLE_TEST_AUTH=true
refuse 'email provider' "${ready[@]}"

echo "== It migrates, starts and answers"
compose up -d --no-build --wait --wait-timeout 180 app db
curl -fsS "$base/api/health" | grep -q '"status":"healthy"' || fail "the health check"

echo "== It serves the web app"
for route in / /meetings/ABC123; do
  headers=$(curl -fsS -D - -o "$work/page.html" "$base$route")
  grep -q '<div id="root">' "$work/page.html" || fail "$route is not the web app"
  grep -qi '^cache-control: no-cache' <<<"$headers" || fail "$route may be cached"
  grep -qi "^content-security-policy:.*default-src 'self'" <<<"$headers" || fail "$route has no CSP"
  # The meeting socket's address, from APP_URL
  grep -qiE "^content-security-policy:.*connect-src 'self' ws://127\.0\.0\.1(;|\s|$)" <<<"$headers" ||
    fail "$route's CSP doesn't let the page open its socket"
done
bundle=$(grep -o '/assets/[^"]*\.js' "$work/page.html" | head -n 1)
[ -n "$bundle" ] || fail "index.html names no bundle"
curl -fsS -D - -o /dev/null "$base$bundle" | grep -qi '^cache-control:.*immutable' ||
  fail "$bundle is not cached for good"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$base/assets/missing-000000.js")" = 404 ] ||
  fail "a missing bundle is not a 404"
# Everything under /api past sign-in needs a session: JSON, never the web app
api=$(curl -s -w ' %{http_code}' "$base/api/organizations")
[[ "$api" == *'"error"'*' 401' ]] || fail "the API answered $api"

echo "== A backup restores the database and the uploads"
sql() { compose exec -T db psql -U robbie -d robbie -tAc "$1"; }
sql "CREATE TABLE smoke_check (note text); INSERT INTO smoke_check VALUES ('before the backup')"
compose exec -T app sh -c 'mkdir -p /data/uploads/SMOKE && echo budget > /data/uploads/SMOKE/budget.txt'
compose run --rm backup once
dump=$(cd "$BACKUP_DIR" && ls robbie-*.dump | tail -n 1)
uploads=$(cd "$BACKUP_DIR" && ls uploads-*.tar.gz | tail -n 1)
[ -O "$BACKUP_DIR/$dump" ] || fail "the backup is not BACKUP_OWNER's"
sql "DROP TABLE smoke_check"
compose exec -T app rm -rf /data/uploads/SMOKE
compose stop app
compose run --rm --entrypoint /bin/sh backup /scripts/restore.sh "$dump" "$uploads"
compose up -d --no-build --wait --wait-timeout 180 app
[ "$(sql 'SELECT note FROM smoke_check')" = 'before the backup' ] || fail "the database"
[ "$(compose exec -T app cat /data/uploads/SMOKE/budget.txt)" = budget ] || fail "the uploads"
migrations=$(find "$here/../backend-node/prisma/migrations" -mindepth 1 -maxdepth 1 -type d | wc -l)
[ "$(sql 'SELECT count(*) FROM _prisma_migrations')" -eq "$migrations" ] || fail "the migrations"
curl -fsS "$base/api/health" | grep -q '"status":"healthy"' || fail "the health check after"

echo "Smoke test passed"
