#!/bin/sh
# Back up Robbie's database and uploaded files into /backups (deploy/backups on the host).
#   backup.sh once   one backup now: before an upgrade, or to test
#   backup.sh loop   the backup service: one backup a day after BACKUP_HOUR_UTC
# Files: robbie-<stamp>.dump (pg_restore's format) and uploads-<stamp>.tar.gz, kept
# BACKUP_KEEP_DAYS days. The database is reached through PGHOST, PGUSER, PGPASSWORD, PGDATABASE.
set -eu
umask 077
backups=/backups
hour="${BACKUP_HOUR_UTC:-9}"
keep="${BACKUP_KEEP_DAYS:-14}"

backup() {
  stamp=$(date -u +%Y-%m-%dT%H%MZ)
  pg_dump --format=custom --file="$backups/robbie-$stamp.dump.partial"
  mv "$backups/robbie-$stamp.dump.partial" "$backups/robbie-$stamp.dump"
  tar -czf "$backups/uploads-$stamp.tar.gz.partial" -C /data/uploads .
  mv "$backups/uploads-$stamp.tar.gz.partial" "$backups/uploads-$stamp.tar.gz"
  if [ -n "${BACKUP_OWNER:-}" ]; then
    chown "$BACKUP_OWNER" "$backups/robbie-$stamp.dump" "$backups/uploads-$stamp.tar.gz"
  fi
  find "$backups" \( -name 'robbie-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$keep" -delete
  find "$backups" -name '*.partial' -mtime +1 -delete
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
        backup || echo "Backup failed; trying again in 10 minutes" >&2
      fi
      sleep 600
    done
    ;;
  *)
    echo "Usage: backup.sh once|loop" >&2
    exit 2
    ;;
esac
