#!/bin/sh
# Back up Robbie's database and uploaded files into /backups (deploy/backups on the host).
#   backup.sh once   one backup now: before an upgrade, or to test. Exits non-zero if it failed.
#   backup.sh loop   the backup service: one backup a day after BACKUP_HOUR_UTC
# Files: robbie-<stamp>.dump (pg_restore's format) and uploads-<stamp>.tar.gz, kept
# BACKUP_KEEP_DAYS days. The database is reached through PGHOST, PGUSER, PGPASSWORD, PGDATABASE.
#
# A backup is written under temporary names, checked (pg_restore and tar read it back), then
# renamed: the dump last, since the loop takes a dump for today as today's backup done. A failed
# backup leaves nothing behind and deletes nothing; old backups go only after a good one.
set -eu
umask 077
backups=/backups
hour="${BACKUP_HOUR_UTC:-9}"
keep="${BACKUP_KEEP_DAYS:-14}"

backup() {
  stamp=$(date -u +%Y-%m-%dT%H%MZ)
  dump="$backups/robbie-$stamp.dump"
  uploads="$backups/uploads-$stamp.tar.gz"
  # $$ keeps a second backup in the same minute (the service and a manual one) apart
  dump_partial="$dump.$$.partial"
  uploads_partial="$uploads.$$.partial"
  moved=
  done=
  # On any failure (or docker stop), remove what this attempt wrote, including its tarball if
  # it was already renamed, so retries don't pile up files
  trap 'if [ -z "$done" ]; then
    rm -f "$dump_partial" "$uploads_partial"
    if [ -n "$moved" ]; then rm -f "$uploads"; fi
    echo "Backup failed; no backup was deleted" >&2
  fi' EXIT
  trap 'exit 143' TERM INT HUP

  pg_dump --format=custom --file="$dump_partial"
  pg_restore --list "$dump_partial" >/dev/null
  tar -czf "$uploads_partial" -C /data/uploads .
  tar -tzf "$uploads_partial" >/dev/null
  mv "$uploads_partial" "$uploads"
  moved=1
  mv "$dump_partial" "$dump"
  done=1

  if [ -n "${BACKUP_OWNER:-}" ]; then
    chown "$BACKUP_OWNER" "$dump" "$uploads"
  fi
  find "$backups" -maxdepth 1 \( -name 'robbie-*.dump' -o -name 'uploads-*.tar.gz' \) \
    -mtime +"$keep" -delete
  # Left by a backup killed outright (kill -9, a power cut)
  find "$backups" -maxdepth 1 -name '*.partial' -mtime +1 -delete
  echo "Backed up to robbie-$stamp.dump and uploads-$stamp.tar.gz"
}

case "${1:-loop}" in
  once)
    backup
    ;;
  loop)
    echo "Backing up every day after $hour:00 UTC, keeping $keep days"
    while true; do
      today=$(date -u +%Y-%m-%d)
      if [ "$(date -u +%H)" -ge "$hour" ] && ! ls "$backups"/robbie-"$today"T*.dump >/dev/null 2>&1; then
        # Its own process, so set -e stops a failed backup (a function on the left of || runs
        # with set -e off)
        sh "$0" once || echo "Backup failed; trying again in 10 minutes" >&2
      fi
      sleep 600
    done
    ;;
  *)
    echo "Usage: backup.sh once|loop" >&2
    exit 2
    ;;
esac
