#!/usr/bin/env bash
# Restore a dump into a CLEAN database, then run the smoke test.
#   ops/restore.sh <backup file> <target mongodb uri>
# Never point this at production data you want to keep: --drop replaces collections.
# Monthly restore drill: restore into a scratch database, run the smoke test, log the result in docs/RUNBOOK.md.
set -euo pipefail

FILE="${1:?usage: restore.sh <backup file> <target uri>}"
TARGET="${2:?usage: restore.sh <backup file> <target uri>}"

WORK="$FILE"
if [[ "$FILE" == *.enc ]]; then
  : "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required for an encrypted backup}"
  WORK="$(mktemp)"
  trap 'rm -f "$WORK"' EXIT
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$FILE" -out "$WORK"
fi

START=$(date +%s)
mongorestore --uri="$TARGET" --archive="$WORK" --gzip --drop
echo "restored in $(( $(date +%s) - START ))s"

cd "$(dirname "$0")/.."
DATABASE_URL="$TARGET" npx tsx src/scripts/smokeTest.ts
