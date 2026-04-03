#!/usr/bin/env bash
# Manual MongoDB backup script
# Usage: ./tools/scripts/backup-mongodb.sh <mongodb-uri> [output-dir]
# Run from repo root so ./backups rotation applies.
#
# Requires: mongodump (MongoDB Database Tools)

set -euo pipefail

MONGODB_URI="${1:?Usage: $0 <mongodb-uri> [output-dir]}"
OUTPUT_DIR="${2:-./backups/$(date +%Y%m%d_%H%M%S)}"

echo "Backing up MongoDB to $OUTPUT_DIR..."
mkdir -p "$OUTPUT_DIR"

mongodump --uri="$MONGODB_URI" --out="$OUTPUT_DIR" --gzip

echo "Backup complete. Size:"
du -sh "$OUTPUT_DIR"

# Keep only last 7 backups under ./backups (newest dirs first)
if [[ -d ./backups ]]; then
  # shellcheck disable=SC2012
  ls -dt ./backups/*/ 2>/dev/null | tail -n +8 | xargs rm -rf 2>/dev/null || true
  echo "Cleaned old backups under ./backups (keeping last 7)"
fi
