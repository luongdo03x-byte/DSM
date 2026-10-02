# Local backup and restore

Backups are PostgreSQL custom-format dumps and never embed credentials. Set `DATABASE_URL` and optionally `BACKUP_DIR`, then run `scripts/backup-postgres.sh`.

Restore is intentionally guarded. Set `TARGET_DATABASE_URL` to a disposable/target database and `CONFIRM_RESTORE=YES`, then run `scripts/restore-postgres.sh <backup.dump>`. The restore uses `--clean --if-exists`; verify the target before confirmation.

Development, test, and production must use separate environment variable sets and separate databases/credentials. Do not commit `.env` files containing real secrets.
