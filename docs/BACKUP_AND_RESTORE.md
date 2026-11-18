# Backup & Restore Procedures

This document describes how to safely back up and restore the transactional JSON databases used by the ZAROORAT platform.

## 1. Backup Procedure

Since the system uses flat-file JSON storage (`businesses.json` and `sessions.json`), backups are performed by copying these files to a secure location, ideally outside the application root, followed by verification.

### Steps:
1.  **Stop the backend server** to ensure no writes occur during the backup:
    ```bash
    # If running with PM2:
    pm2 stop zaroorat
    ```
2.  **Copy the data files** to the `database/backups/` directory (or a secure off-site location):
    ```bash
    mkdir -p database/backups/$(date +%Y-%m-%d)
    cp database/data/businesses.json database/backups/$(date +%Y-%m-%d)/
    cp database/data/sessions.json database/backups/$(date +%Y-%m-%d)/
    ```
3.  **Generate integrity checksums** for the backup:
    ```bash
    cd database/backups/$(date +%Y-%m-%d)
    sha256sum businesses.json > businesses.json.sha256
    sha256sum sessions.json > sessions.json.sha256
    ```
4.  **Restart the backend server**:
    ```bash
    pm2 start zaroorat
    ```

## 2. Restore Procedure

Restoring data involves replacing the active files with a previously backed-up set.

### Steps:
1.  **Stop the backend server**:
    ```bash
    pm2 stop zaroorat
    ```
2.  **Verify integrity of the backup** before restoration:
    ```bash
    cd database/backups/<backup-date>
    sha256sum -c businesses.json.sha256
    sha256sum -c sessions.json.sha256
    # If checksums do not match, DO NOT proceed with restoration.
    ```
3.  **Replace active files**:
    ```bash
    cp database/backups/<backup-date>/businesses.json database/data/
    cp database/backups/<backup-date>/sessions.json database/data/
    ```
4.  **Ensure permissions** are correct (ensure the user running the Node.js process owns the files).
5.  **Restart the backend server**:
    ```bash
    pm2 start zaroorat
    ```

## 3. Data Safety Principles
- **Atomic Writes**: The application ensures data integrity during normal operation by performing atomic-like write operations to the JSON files.
- **Never Modify Live Files**: Always stop the server before manually manipulating the database files to avoid corruption.
- **Verification**: Always verify file checksums after restoration to ensure the data was not corrupted during backup or transfer.
