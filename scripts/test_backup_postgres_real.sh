#!/usr/bin/env bash
# ACTUAL PostgreSQL 17 pg_dump / pg_restore test; ALL contents are synthetic.
# Needs GitHub Actions ubuntu-24.04 with the postgres:17 service mapped to port 55432.
# Never connects to Neon or any external Postgres host.
set -Eeuo pipefail
umask 077
[[ "$RUNNER_OS" == Linux && "$CI" == true ]] || { echo "Run only on GitHub hosted Linux CI" >&2; exit 2; }
command -v docker >/dev/null || { echo "Docker required" >&2; exit 2; }
command -v gpg >/dev/null || { echo "GPG required" >&2; exit 2; }
command -v sha256sum >/dev/null || { echo "sha256sum required" >&2; exit 2; }
work="$(mktemp -d "$RUNNER_TEMP/cotiza-real-pg-fixture.XXXXXXXX")"
cleanup() { rm -rf -- "$work"; }
trap cleanup EXIT
mkdir -m 700 -- "$work/gnupg" "$work/bin"
export GNUPGHOME="$work/gnupg"
export PGHOST=127.0.0.1 PGPORT=55432 PGUSER=cotiza_ci
export PGPASSWORD=cotiza-ci-fixture-only PGSSLMODE=disable
cat >"$work/bin/pg-client-wrapper" <<'EOS'
#!/usr/bin/env bash
set -Eeuo pipefail
client="$(basename -- "$0")"
exec docker run --rm -i --network host \
  -e PGHOST -e PGPORT -e PGUSER -e PGDATABASE -e PGPASSWORD -e PGSSLMODE \
  postgres:17 "$client" "$@"
EOS
chmod 700 "$work/bin/pg-client-wrapper"
for client in pg_dump pg_restore psql; do
  ln -s pg-client-wrapper "$work/bin/$client"
done
export PATH="$work/bin:$PATH"
[[ "$(pg_dump --version)" == *"PostgreSQL 17."* ]]
for i in 1 2 3 4 5 6 7 8 9 10; do
  if psql --no-password --dbname=cotiza_source_fixture --command='SELECT 1' >/dev/null 2>&1; then break; fi
  sleep 1
done

psql --no-psqlrc --no-password --set ON_ERROR_STOP=1 --dbname=cotiza_source_fixture <<'SQL' >/dev/null
CREATE TABLE public.tenants (tenant_id text PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.quotes (quote_id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(tenant_id), total_revenue numeric(12,2) NOT NULL);
CREATE TABLE public.proposals (proposal_id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(tenant_id), quote_id text REFERENCES quotes(quote_id), invoice_uuid text);
CREATE TABLE public.formal_proposals (proposal_doc_id text PRIMARY KEY, proposal_id text REFERENCES proposals(proposal_id), delivery_hash text);
INSERT INTO tenants VALUES ('fixture-a','Fictional A'),('fixture-b','Fictional B');
INSERT INTO quotes VALUES ('quote-a','fixture-a',100.00),('quote-b','fixture-b',200.00);
INSERT INTO proposals VALUES ('proposal-a','fixture-a','quote-a','FICTIONAL-NOT-A-CFDI'),('proposal-b','fixture-b','quote-b',NULL);
INSERT INTO formal_proposals VALUES ('doc-a','proposal-a','FICTIONAL-DELIVERY-HASH'),('doc-b','proposal-b',NULL);
SQL

psql --no-psqlrc --no-password --set ON_ERROR_STOP=1 --dbname=postgres \
  --command='CREATE DATABASE cotiza_restore_fixture;' >/dev/null
cat >"$work/key.batch" <<'EOF'
%no-protection
Key-Type: eddsa
Key-Curve: ed25519
Key-Usage: sign
Subkey-Type: ecdh
Subkey-Curve: cv25519
Subkey-Usage: encrypt
Name-Real: Fictional Cotiza Backup
Name-Email: fictional@example.invalid
Expire-Date: 1d
%commit
EOF
gpg --batch --generate-key "$work/key.batch" >/dev/null 2>&1
fingerprint="$(gpg --batch --with-colons --list-keys | awk -F: '$1=="fpr"{print $10;exit}')"
[[ "$fingerprint" =~ ^[[:xdigit:]]{40}$ ]]
archive="$work/only-fictional.pgcustom.gpg"
pg_dump --no-password --format=custom --no-owner --no-acl --dbname=cotiza_source_fixture \
  | gpg --batch --yes --trust-model always --encrypt --recipient "$fingerprint" --output "$archive"
sha256sum < "$archive" | cut -d ' ' -f 1 > "$archive.sha256"
chmod 600 "$archive" "$archive.sha256"
# Exercise actual product verification and restore routines, not copies of them.
bash scripts/backup_neon_encrypted.sh verify "$archive"
printf 'fixture-only-password\n' > "$work/passfile"
chmod 600 "$work/passfile"
export COTIZA_RESTORE_PGHOST=127.0.0.1 COTIZA_RESTORE_PGPORT=55432
export COTIZA_RESTORE_PGDATABASE=cotiza_restore_fixture
export COTIZA_RESTORE_PGUSER=cotiza_ci
export COTIZA_RESTORE_PGPASSFILE="$work/passfile"
export COTIZA_RESTORE_ACK=DISPOSABLE_LOCAL_DATABASE
bash scripts/backup_neon_encrypted.sh restore-test "$archive"
expected="2|2|2|2|1|1"
observed="$(psql --no-psqlrc --no-password --tuples-only --no-align --set ON_ERROR_STOP=1 --dbname=cotiza_restore_fixture --command="SELECT (SELECT count(*) FROM tenants), (SELECT count(*) FROM quotes), (SELECT count(*) FROM proposals), (SELECT count(*) FROM formal_proposals), (SELECT count(*) FROM proposals WHERE invoice_uuid='FICTIONAL-NOT-A-CFDI'), (SELECT count(*) FROM formal_proposals WHERE delivery_hash='FICTIONAL-DELIVERY-HASH');" --field-separator='|')"
[[ "$observed" == "$expected" ]] || { echo "Restored counts/evidence mismatch" >&2; exit 1; }
# Check FK behavior remains enforced after restoration.
if psql --no-psqlrc --no-password --set ON_ERROR_STOP=1 --dbname=cotiza_restore_fixture --command="INSERT INTO quotes VALUES ('cross-fixture','tenant-missing',0.00);" >/dev/null 2>&1; then
  echo "Foreign-key rejection missing after restore" >&2; exit 1
fi
# The backup tool must still refuse a second restore onto a nonempty database.
if bash scripts/backup_neon_encrypted.sh restore-test "$archive" >/dev/null 2>&1; then
  echo "Second restore unexpectedly accepted" >&2; exit 1
fi
echo "PASS: real PostgreSQL 17 dump + GPG encrypted stream + real isolated restore + fictional fiscal metadata + FK + overwrite rejection"
