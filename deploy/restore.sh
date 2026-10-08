#!/bin/sh
# Replace Robbie's database, and optionally its uploaded files, with a backup from /backups
# (deploy/backups on the host). Stop the app first (docs/deploy.md, "Restore"):
#   docker compose stop app
#   docker compose run --rm --entrypoint /bin/sh backup /scripts/restore.sh robbie-<stamp>.dump uploads-<stamp>.tar.gz
#   docker compose up -d app
set -eu
dump="/backups/${1:?Usage: restore.sh robbie-<stamp>.dump [uploads-<stamp>.tar.gz]}"
uploads="${2:+/backups/$2}"
[ -f "$dump" ] || { echo "No such backup: $dump" >&2; exit 1; }
[ -z "$uploads" ] || [ -f "$uploads" ] || { echo "No such backup: $uploads" >&2; exit 1; }

echo "Replacing the database $PGDATABASE with $dump"
dropdb --if-exists --force "$PGDATABASE"
createdb "$PGDATABASE"
pg_restore --no-owner --exit-on-error --dbname="$PGDATABASE" "$dump"

if [ -n "$uploads" ]; then
  echo "Replacing the uploaded files with $uploads"
  find /data/uploads -mindepth 1 -delete
  tar -xzpf "$uploads" --numeric-owner -C /data/uploads
fi
echo "Restored. Start the app: docker compose up -d app"
