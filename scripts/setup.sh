#!/usr/bin/env bash
# One-time setup for a fresh dev/cloud container: deps, local Postgres, server/.env.
# Safe to run repeatedly.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "› Installing dependencies"
npm ci --prefix server --no-audit --no-fund >/dev/null
npm ci --prefix client --no-audit --no-fund >/dev/null

echo "› Starting local Postgres"
if command -v pg_ctlcluster >/dev/null 2>&1; then
  ver=$(ls /usr/lib/postgresql 2>/dev/null | sort -n | tail -1)
  pg_ctlcluster "$ver" main start 2>/dev/null || true
elif command -v service >/dev/null 2>&1; then
  service postgresql start >/dev/null 2>&1 || true
fi
for _ in $(seq 1 20); do pg_isready -q 2>/dev/null && break; sleep 0.5; done
if pg_isready -q 2>/dev/null; then
  su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='playnest'\"" | grep -q 1 \
    || su postgres -c "psql -qc \"CREATE USER playnest WITH PASSWORD 'playnest' SUPERUSER;\""
  su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='playnest'\"" | grep -q 1 \
    || su postgres -c "createdb -O playnest playnest"
else
  echo "  ! Postgres not available — DB-backed manual testing won't work (unit tests still do)."
fi

if [ ! -f server/.env ]; then
  printf 'DATABASE_URL=postgresql://playnest:playnest@localhost:5432/playnest\nJWT_SECRET=dev-secret\nPORT=3001\n' > server/.env
  echo "› Wrote server/.env (local dev only, git-ignored)"
fi

echo "› Git identity for this repo"
git config user.name "vignesh-dwtc"
git config user.email "vignesh.murugan@dwtc.com"

echo "✓ Setup done. Run tests: npm test   ·   Dev: npm run dev:server + npm run dev:client"
