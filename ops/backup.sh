#!/usr/bin/env bash
# Daily encrypted MongoDB dump with 14 day retention.
#   DATABASE_URL        connection string (read from the environment or ../.env)
#   BACKUP_DIR          where dumps are kept (default ./backups)
#   BACKUP_PASSPHRASE   if set, the dump is encrypted with AES-256 (openssl)
#   BACKUP_RETENTION_DAYS (default 14)
#   BACKUP_UPLOAD_CMD   optional command that copies the finished file off the server, e.g. 'rclone copy "$FILE" r2:school-backups'
# Cron example (02:30 every day):  30 2 * * * /srv/school-server/ops/backup.sh >> /var/log/school-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"
fi
: "${DATABASE_URL:?DATABASE_URL is not set}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/school-$STAMP.archive.gz"

echo "[$(date -u +%FT%TZ)] dumping"
mongodump --uri="$DATABASE_URL" --archive="$FILE" --gzip --quiet

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -in "$FILE" -out "$FILE.enc"
  rm -f "$FILE"
  FILE="$FILE.enc"
fi

SIZE="$(wc -c < "$FILE")"
if [ "$SIZE" -lt 1024 ]; then
  echo "backup looks empty ($SIZE bytes), failing" >&2
  exit 1
fi
echo "[$(date -u +%FT%TZ)] wrote $FILE ($SIZE bytes)"

if [ -n "${BACKUP_UPLOAD_CMD:-}" ]; then
  export FILE
  bash -c "$BACKUP_UPLOAD_CMD"
  echo "uploaded off-box"
fi

find "$BACKUP_DIR" -name 'school-*.archive.gz*' -mtime +"$RETENTION" -delete
echo "[$(date -u +%FT%TZ)] done"
