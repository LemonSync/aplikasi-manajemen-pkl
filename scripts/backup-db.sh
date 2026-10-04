#!/bin/bash
# Backup script untuk database MySQL
# Jalankan via cron: 0 2 * * * /path/to/backup-db.sh

BACKUP_DIR="/opt/backups/pkl-db"
DB_NAME="${DB_NAME:-pkl_db}"
DB_USER="${DB_USER:-root}"
DB_HOST="localhost"
RETENTION_DAYS=30

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/backup_${DB_NAME}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

# Dump database
mysqldump -u "$DB_USER" -h "$DB_HOST" "$DB_NAME" | gzip > "$BACKUP_FILE"

# Hapus backup lama
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup selesai: $BACKUP_FILE"
