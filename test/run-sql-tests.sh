#!/usr/bin/env bash
# Runs the migration + RLS tests against a throwaway local Postgres database (needs local postgres; LOCAL ONLY).
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-rm_test}
TMP=$(mktemp -d); cp test/sql/*.sql supabase/migrations/001_init.sql supabase/seed.sql "$TMP"/; chmod -R a+rX "$TMP"
PSQL="sudo -u postgres psql -X -q -v ON_ERROR_STOP=1"
$PSQL -c "drop database if exists $DB" -c "create database $DB"
for f in 00_supabase_stub.sql 001_init.sql seed.sql 10_rls_test.sql; do $PSQL -d "$DB" -f "$TMP/$f"; done
