# Disaster recovery

This doc covers backups and restores for PiggyBack-hosted users and the
operators (you).

## Backup mechanisms

### Per-tenant Supabase

Every Supabase project on the free tier gets **automated daily snapshots**
via Supabase's own backup mechanism, retained for 7 days. No action required.

For larger / on-demand snapshots, take a manual `pg_dump`:

```bash
# Reset DB password (reversible — Supabase rotates again next time you reset)
curl -X PATCH \
  -H "Authorization: Bearer $SUPABASE_MANAGEMENT_TOKEN" \
  -H "Content-Type: application/json" \
  https://api.supabase.com/v1/projects/$PROJECT_REF/database/password \
  -d "{\"password\":\"$NEW_PASS\"}"

# Find the regional pooler hostname (usually aws-1-{region}.pooler.supabase.com)
PGPASSWORD=$NEW_PASS pg_dump \
  "host=aws-1-ap-northeast-1.pooler.supabase.com port=5432 \
   user=postgres.$PROJECT_REF dbname=postgres sslmode=require" \
  --no-owner --no-privileges --no-comments \
  --schema=public --schema=auth \
  > backup.sql
```

### JSONL data-only backup (Mgmt API)

For paranoia or when you only have the Management token (no DB password):

```bash
python3 /Users/ben/Projects/personal/PiggyBack/scripts/backup-supabase.py \
  $PROJECT_REF /path/to/output/dir
```

The script pages every `public.*` table via `row_to_json()` over the SQL endpoint.
Slower than `pg_dump` but doesn't require credential rotation. Misses
sequences, RLS policies, and triggers — use `pg_dump` for true point-in-time.

## Restore — full pg_dump

Restore into a fresh Postgres 17 instance (Docker example):

```bash
docker run -d --name pg-restore \
  -e POSTGRES_PASSWORD=testpass \
  -p 55432:5432 \
  postgres:17

# Wait for ready
until docker exec pg-restore pg_isready -U postgres; do sleep 1; done

# Pre-create the auth + extensions schema scaffolding the dump expects.
# (Supabase production sets these up automatically; a vanilla Postgres
# does not, so the dump references them.)
docker exec -i pg-restore psql -U postgres -d postgres <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA extensions;
DO $$ BEGIN CREATE ROLE anon NOINHERIT NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOINHERIT NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOINHERIT NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
SQL

# Now restore.
docker exec -i pg-restore psql -U postgres -d postgres < /path/to/backup.sql

# Verify counts (replace expected values from the backup manifest).
docker exec pg-restore psql -U postgres -d postgres -c "
  SELECT count(*) AS users FROM auth.users;
  SELECT count(*) AS transactions FROM public.transactions;
"
```

### Expected benign errors during restore

The following are SAFE to ignore:

- `ERROR: schema "auth" already exists` — pre-create above.
- `ERROR: schema "public" already exists` — Postgres ships with one.
- `ERROR: schema "private" does not exist` — the dump references but doesn't
  create this schema; nothing actually lives in it.

## Restore — JSONL backup

If you only have the JSONL backup (no `pg_dump.sql`), you can replay it via:

```bash
# psql can't directly ingest JSONL. Convert to SQL first via a small node script.
# Take auth_users.jsonl + each table.jsonl and emit INSERT statements.
# (Script TBD — easier to just use pg_dump where possible.)
```

In practice, for any meaningful restore use the `pg_dump.sql` file. JSONL is the
"Management API only" fallback.

## Last-known-verified restore

A successful restore of the personal-data backup (4.7 MB pg_dump, 11,369
rows + 4 auth users) was performed on 2026-04-30 against a fresh
`postgres:17` Docker container. All row counts matched the manifest exactly.
