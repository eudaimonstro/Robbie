#!/bin/sh
# Replace Robbie's database, and optionally its uploaded files, with a backup from /backups
# (deploy/backups on the host). Take a backup and stop the app and the backup service first
# (docs/deploy.md, "Restore"):
#   docker compose run --rm backup once
#   docker compose stop app backup
#   docker compose run --rm --entrypoint /bin/sh backup /scripts/restore.sh robbie-<stamp>.dump uploads-<stamp>.tar.gz
#   docker compose up -d app backup
#
# Nothing is replaced until the whole backup has been read: the dump is restored into a scratch
# database and the uploads unpacked into a scratch folder, and only then swapped in. A backup
# that fails to restore leaves the database and the files as they were.
set -eu
dump="/backups/${1:?Usage: restore.sh robbie-<stamp>.dump [uploads-<stamp>.tar.gz]}"
uploads="${2:+/backups/$2}"
db="$PGDATABASE"
scratch="${db}_restore"
previous="${db}_previous"
incoming=/data/uploads/.restore-incoming
# Without the notices dropdb --if-exists prints
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
[ -f "$dump" ] || { echo "No such backup: $dump" >&2; exit 1; }
[ -z "$uploads" ] || [ -f "$uploads" ] || { echo "No such backup: $uploads" >&2; exit 1; }

# Statements about the database itself run from the maintenance database
admin() { psql --dbname=postgres --no-psqlrc --quiet -v ON_ERROR_STOP=1 "$@"; }

swapped=
finished=
cleanup() {
  if [ -z "$swapped" ]; then
    dropdb --if-exists --force "$scratch" 2>/dev/null || true
    rm -rf "$incoming"
    echo "Restore failed: the database $db and the uploaded files are unchanged" >&2
  elif [ -z "$finished" ]; then
    echo "The database was restored, but replacing the uploaded files failed: the backup's files are in $incoming" >&2
  fi
}
trap cleanup EXIT
trap 'exit 143' TERM INT HUP

echo "Checking $dump${uploads:+ and $uploads}"
pg_restore --list "$dump" >/dev/null
[ -z "$uploads" ] || tar -tzf "$uploads" >/dev/null

echo "Restoring $dump into the scratch database $scratch"
dropdb --if-exists --force "$scratch"
createdb "$scratch"
pg_restore --no-owner --exit-on-error --single-transaction --dbname="$scratch" "$dump"

if [ -n "$uploads" ]; then
  echo "Unpacking $uploads"
  rm -rf "$incoming"
  mkdir "$incoming"
  tar -xzpf "$uploads" --numeric-owner -C "$incoming"
fi

echo "Replacing the database $db"
dropdb --if-exists --force "$previous"
# One transaction: the database is never missing, and if anything is still connected to it
# (the app or the backup service running) the renames fail and nothing changes
admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$db'" >/dev/null
admin <<EOF
BEGIN;
ALTER DATABASE "$db" RENAME TO "$previous";
ALTER DATABASE "$scratch" RENAME TO "$db";
COMMIT;
EOF
swapped=1
dropdb --force "$previous" || echo "Could not drop the old copy $previous; drop it later with dropdb" >&2

if [ -n "$uploads" ]; then
  echo "Replacing the uploaded files"
  find /data/uploads -mindepth 1 -maxdepth 1 ! -path "$incoming" -exec rm -rf {} +
  find "$incoming" -mindepth 1 -maxdepth 1 -exec mv {} /data/uploads/ \;
  rmdir "$incoming"
fi
finished=1
echo "Restored. Start the app and the backup service: docker compose up -d app backup"
