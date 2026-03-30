# Step 1: Progress Protection (Code + Data)

Goal: reduce the chance of losing progress by making backups automatic and testable.

## What this setup gives you

- Timestamped code backups of:
  - full Git history (`repo.bundle`)
  - current uncommitted work (`working-tree.patch`)
  - current tracked files (`tracked-files.zip`)
- Optional database backup (`database.dump`) if DB URL and `pg_dump` are available
- One-command restore checks (`git bundle verify`, clone test, optional DB dump check)
- Automatic cleanup of old backups by retention days

## One-time setup

1. Make sure this repo has a private remote and push frequently:

```powershell
git remote -v
```

2. (Optional but recommended) Install PostgreSQL client tools so `pg_dump`/`pg_restore` are available.

3. Set environment variables for your shell/user:

```powershell
# Use your Supabase/Postgres connection string:
# postgres://USER:PASSWORD@HOST:PORT/postgres
$env:SUPABASE_DB_URL = "your-db-connection-string"

# Offsite path should be a cloud-synced folder (OneDrive/Dropbox/iCloud Drive/etc.)
$env:BACKUP_OFFSITE_PATH = "C:\Users\YOUR_USER\OneDrive\project-backups"
```

If you do not set `SUPABASE_DB_URL`, code backups still run.
If you do not set `BACKUP_OFFSITE_PATH`, backup files remain local only.

## Daily backup command

```powershell
npm run backup:run
```

Default retention is 30 days.

For a different retention (example: 7 days):

```powershell
npm run backup:run:7d
```

## Monthly restore drill

Run:

```powershell
npm run backup:verify
```

This validates the latest backup zip by:
- verifying the Git bundle
- cloning from the bundle into a temp directory
- validating DB dump readability if `pg_restore` is installed

## Suggested minimum cadence

- Daily: `npm run backup:run`
- Weekly: confirm backup zip exists in local + offsite locations
- Monthly: `npm run backup:verify`

## Optional Windows Task Scheduler automation

Example action command:

```text
powershell.exe
```

Arguments:

```text
-ExecutionPolicy Bypass -Command "cd 'C:\Users\MackBloom\nextjs-boilerplate'; npm run backup:run"
```

Trigger: daily at a fixed time you are usually online.
