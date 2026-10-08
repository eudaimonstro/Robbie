#!/usr/bin/env bash
# Run the Maple Grove HOA demo on this machine: its own Postgres in Docker, the production build
# of the API and the web app on one port, and test sign-in with the code 000000.
#
# Usage: npm run demo [-- --reset | --stop | --remove]
#   (none)    start the database, build, migrate, seed on the first run, and serve on port 3301
#   --reset   the same, but replace the demo with a fresh one (its meetings and minutes too)
#   --stop    stop a demo server still running and the database container (the data stays)
#   --remove  stop both, then delete the container and its volume (the demo's data is gone)
#
# The database lives in the container robbie-demo-pg (port 55433 on 127.0.0.1, volume
# robbie-demo-pgdata), apart from development's database and the tests' (port 55432). The server
# never reads its database from backend-node/.env: everything it needs is set here, and dotenv
# leaves variables that are already set alone.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTAINER=robbie-demo-pg
VOLUME=robbie-demo-pgdata
IMAGE=postgres:16-alpine
DB_PORT=55433
APP_PORT=3301
APP_URL="http://localhost:${APP_PORT}"
MEETING_CODE=MAPLE1
DEMO_SLUG=maple-grove-hoa
# Gitignored (.cache/): the server's PID and the uploaded files
STATE_DIR="$ROOT/.cache/demo"
PID_FILE="$STATE_DIR/server.pid"
UPLOAD_DIR="$STATE_DIR/uploads"
DATABASE_URL="postgresql://postgres:postgres@localhost:${DB_PORT}/robbie"

fail() {
  echo "demo: $*" >&2
  exit 1
}

usage() {
  sed -n '5,9p' "$0" | sed 's/^# \{0,1\}//'
}

mode=start
reset=false
for arg in "$@"; do
  case "$arg" in
    --reset) reset=true ;;
    --stop) mode=stop ;;
    --remove) mode=remove ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

check_docker() {
  command -v docker >/dev/null 2>&1 ||
    fail "Docker is not installed. Install Docker (https://docs.docker.com/get-docker/) and try again."
  docker info >/dev/null 2>&1 ||
    fail "Docker is installed but not running, or this user can't reach it. Start Docker and try again."
}

check_node() {
  command -v node >/dev/null 2>&1 ||
    fail "Node.js is not installed. Install Node 24 (see .nvmrc; with nvm: nvm install) and try again."
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 24 ] ||
    fail "Node $(node --version) is too old: Robbie needs Node 24 (see .nvmrc; with nvm: nvm use)."
  [ -d "$ROOT/node_modules" ] || fail "The dependencies are not installed. Run npm install first."
}

container_running() {
  [ -n "$(docker ps -q --filter "name=^${CONTAINER}\$")" ]
}

container_exists() {
  [ -n "$(docker ps -aq --filter "name=^${CONTAINER}\$")" ]
}

# The PID of a demo server still running, if any (a stale PID file names nothing, or another
# program)
server_pid() {
  [ -f "$PID_FILE" ] || return 1
  local pid
  pid="$(cat "$PID_FILE")"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  ps -p "$pid" -o args= 2>/dev/null | grep -q 'dist/index.js' || return 1
  echo "$pid"
}

stop_server() {
  local pid
  if pid="$(server_pid)"; then
    echo "Stopping the demo server (PID $pid)..."
    kill "$pid"
    for _ in $(seq 1 30); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.5
    done
    kill -0 "$pid" 2>/dev/null && fail "The demo server (PID $pid) did not stop. Stop it by hand."
  fi
  rm -f "$PID_FILE"
}

stop_database() {
  if container_running; then
    echo "Stopping the database container $CONTAINER..."
    docker stop "$CONTAINER" >/dev/null
  fi
}

psql_demo() {
  docker exec "$CONTAINER" psql -U postgres -d robbie -v ON_ERROR_STOP=1 -tAc "$1"
}

start_database() {
  if container_running; then
    echo "Using the running database container $CONTAINER."
  elif container_exists; then
    echo "Starting the database container $CONTAINER..."
    docker start "$CONTAINER" >/dev/null
  else
    echo "Creating the database container $CONTAINER (port $DB_PORT, volume $VOLUME)..."
    docker run -d --name "$CONTAINER" \
      -p "127.0.0.1:${DB_PORT}:5432" \
      -v "${VOLUME}:/var/lib/postgresql/data" \
      -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=robbie \
      "$IMAGE" >/dev/null ||
      fail "Could not start $CONTAINER. Is port $DB_PORT already in use?"
  fi

  # Over TCP: while a new volume is initialized, Postgres runs a temporary server on the socket
  # only, which a plain pg_isready would take for the real one
  echo -n "Waiting for the database"
  for _ in $(seq 1 60); do
    if docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U postgres -d robbie >/dev/null 2>&1; then
      echo " ready."
      return
    fi
    echo -n "."
    sleep 1
  done
  echo
  docker logs --tail 20 "$CONTAINER" >&2 || true
  fail "The database in $CONTAINER was not ready after 60 seconds (its last log lines are above)."
}

port_free() {
  node -e '
    const server = require("net").createServer();
    server.once("error", () => process.exit(1));
    server.listen(Number(process.argv[1]), "0.0.0.0", () => server.close(() => process.exit(0)));
  ' "$1"
}

# This machine's address on the local network, for phones on the same Wi-Fi
lan_address() {
  local address=""
  if command -v ip >/dev/null 2>&1; then
    address="$(ip -4 route get 1.1.1.1 2>/dev/null |
      awk '{ for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit } }')"
  fi
  if [ -z "$address" ] && command -v ipconfig >/dev/null 2>&1; then
    address="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
  fi
  echo "$address"
}

print_guide() {
  local lan="$1"
  local display="$APP_URL/meetings/$MEETING_CODE/display"
  cat <<EOF

================================================================================
 Robbie demo: Maple Grove HOA
================================================================================
 Open            $APP_URL
 Sign-in code    000000 (for every email below; no email is sent)
 Meeting code    $MEETING_CODE (this year's annual meeting)

 Sign each person in from a separate browser profile or private window:
   Dana Okafor     dana@maplegrove.example     chairs, from the laptop: Live Meetings, Start
   Alice Brennan   alice@maplegrove.example    a homeowner on a phone
   Ben Whitaker    ben@maplegrove.example      a homeowner on a phone
   Morgan Lee      morgan@maplegrove.example   the TV: $display
   Pat Lindqvist   pat@maplegrove.example      the secretary: the schedule before, Minutes after

 Walk-through: docs/demo.md
EOF
  if [ -n "$lan" ]; then
    cat <<EOF

 Phones on the same Wi-Fi: http://$lan:$APP_PORT
   The QR code points at the address the display was opened from, so for phones
   open the display at http://$lan:$APP_PORT/meetings/$MEETING_CODE/display
EOF
  fi
  cat <<EOF

 Ctrl-C stops the server. npm run demo -- --stop stops the database too;
 -- --reset starts over with a fresh demo; -- --remove deletes the demo's data.
================================================================================

EOF
}

case "$mode" in
  stop)
    stop_server
    check_docker
    stop_database
    echo "Stopped. The demo's data stays in the volume $VOLUME; npm run demo starts it again."
    exit 0
    ;;
  remove)
    stop_server
    check_docker
    if container_exists; then
      echo "Removing the container $CONTAINER..."
      docker rm -f "$CONTAINER" >/dev/null
    fi
    if docker volume inspect "$VOLUME" >/dev/null 2>&1; then
      echo "Removing the volume $VOLUME..."
      docker volume rm "$VOLUME" >/dev/null
    fi
    rm -rf "$STATE_DIR"
    echo "Removed. The next npm run demo creates a fresh demo."
    exit 0
    ;;
esac

check_docker
check_node
if pid="$(server_pid)"; then
  fail "A demo server is already running (PID $pid). Open $APP_URL, or stop it with npm run demo -- --stop."
fi
port_free "$APP_PORT" ||
  fail "Port $APP_PORT is in use by another program. Stop it, then run npm run demo again."

start_database

# The production build: without NODE_ENV, as the deploy builds it (NODE_ENV=development would
# give Vite React's development build)
echo "Building shared, the backend and the web app..."
(cd "$ROOT" && env -u NODE_ENV npm run build) || fail "The build failed (see above)."

# The server, the migrations and the seed all get these, and they win over backend-node/.env.
# Outside production test sign-in works; no email provider, so nothing is sent (the e2e harness
# blanks the same ones, e2e/env.ts); no CLIENT_ORIGIN, since the web app is on the API's origin.
export PORT="$APP_PORT"
export DATABASE_URL
export DIRECT_URL="$DATABASE_URL"
export NODE_ENV=development
export ENABLE_TEST_AUTH=true
export TEST_VERIFICATION_CODE=000000
export APP_URL
export CLIENT_ORIGIN=
export RESEND_API_KEY=
export SENDGRID_API_KEY=
export SMTP_HOST=
export EMAIL_FROM=
export UPLOAD_DIR
# Warnings and errors; LOG_LEVEL=info npm run demo logs every request too
export LOG_LEVEL="${LOG_LEVEL:-warn}"

echo "Applying the database migrations..."
(cd "$ROOT" && npm run db:deploy -w backend-node) || fail "The migrations failed (see above)."

seeded="$(psql_demo "SELECT count(*) FROM \"Organization\" WHERE slug = '$DEMO_SLUG'")"
if [ "$reset" = true ] || [ "$seeded" = 0 ]; then
  # The live meetings are kept outside Prisma (the server creates the table when it first
  # starts): a fresh demo would otherwise find the old meeting under its code (e2e/demo.ts)
  psql_demo "DO \$\$ BEGIN
    IF to_regclass('public.meetings') IS NOT NULL THEN DELETE FROM meetings; END IF;
  END \$\$" >/dev/null
  echo "Seeding the Maple Grove HOA demo..."
  (cd "$ROOT" && npm run seed:demo -w backend-node -- --reset) || fail "The seed failed (see above)."
else
  echo "Using the demo already in the database (npm run demo -- --reset starts over)."
fi
# The sign-in page asks for a code before taking 000000, and an email gets five codes an hour:
# start each run with none
psql_demo 'DELETE FROM "SignInCode"' >/dev/null

mkdir -p "$UPLOAD_DIR"
print_guide "$(lan_address)"

# Say so once the server answers (with LOG_LEVEL=warn it doesn't say so itself)
if command -v curl >/dev/null 2>&1; then
  (
    for _ in $(seq 1 60); do
      sleep 1
      if curl -sf "$APP_URL/api/health" >/dev/null 2>&1; then
        echo "Robbie is ready at $APP_URL"
        exit 0
      fi
    done
  ) &
fi

# The server takes this shell's PID, so Ctrl-C reaches it and --stop finds it
echo "$$" >"$PID_FILE"
cd "$ROOT/backend-node"
exec node dist/index.js
