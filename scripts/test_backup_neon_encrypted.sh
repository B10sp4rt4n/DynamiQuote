#!/usr/bin/env bash
# End-to-end synthetic encryption, verification and safety-guard regression.
set -Eeuo pipefail
umask 077
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
script="$root/scripts/backup_neon_encrypted.sh"
bash -n "$script"
for tool in bash gpg sha256sum awk stat; do command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 2; }; done
work="$(mktemp -d "${HOME}/.cotiza-backup-mock.XXXXXXXX")"
cleanup() { rm -rf -- "$work"; }
trap cleanup EXIT
mkdir -p -- "$work/bin" "$work/keyring" "$work/storage"
chmod 700 -- "$work/keyring" "$work/storage"
cat > "$work/gpg.batch" <<'EOF'
%no-protection
Key-Type: eddsa
Key-Curve: ed25519
Key-Usage: sign
Subkey-Type: ecdh
Subkey-Curve: cv25519
Subkey-Usage: encrypt
Name-Real: Synthetic Cotiza Archive
Name-Email: synthetic@example.invalid
Expire-Date: 1d
%commit
EOF
export GNUPGHOME="$work/keyring"
gpg --batch --generate-key "$work/gpg.batch" >/dev/null 2>&1
export COTIZA_BACKUP_GPG_FINGERPRINT
COTIZA_BACKUP_GPG_FINGERPRINT="$(gpg --batch --with-colons --list-keys 2>/dev/null | awk -F: '$1=="fpr" {print $10; exit}')"
[[ "$COTIZA_BACKUP_GPG_FINGERPRINT" =~ ^[[:xdigit:]]{40}$ ]]
printf 'synthetic-placeholder-password-entry\n' > "$work/pgpass"
chmod 600 -- "$work/pgpass"
cat > "$work/bin/pg_dump" <<'EOF'
#!/usr/bin/env bash
[[ "${PGHOST:-}" == ep-synthetic.c-3.us-east-1.aws.neon.tech && "${PGDATABASE:-}" == neondb && "${PGSSLMODE:-}" == verify-full ]] || exit 4
printf 'SYNTHETIC_PGDUMP_PAYLOAD\n'
EOF
cat > "$work/bin/pg_restore" <<'EOF'
#!/usr/bin/env bash
if [[ " $* " == *' --list '* ]]; then
  cat >/dev/null
  printf '11; 0 12 TABLE DATA public tenants postgres\n12; 0 13 TABLE DATA public quotes postgres\n13; 0 14 TABLE DATA public proposals postgres\n14; 0 15 TABLE DATA public formal_proposals postgres\n'
else
  archive="$(cat)"
  [[ "$archive" == SYNTHETIC_PGDUMP_PAYLOAD ]]
fi
EOF
cat > "$work/bin/psql" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *'pg_catalog.pg_tables'* ]]; then
  if [[ "${MOCK_PG_IS_NOT_EMPTY:-0}" == 1 ]]; then echo 1; else echo 0; fi
else
  echo 'tenants=1;quotes=1;proposals=1;formal_proposals=1'
fi
EOF
chmod 700 -- "$work/bin"/*
export PATH="$work/bin:$PATH"
export COTIZA_BACKUP_PGHOST=ep-synthetic.c-3.us-east-1.aws.neon.tech COTIZA_BACKUP_PGUSER=synthetic
export COTIZA_BACKUP_PGDATABASE=neondb COTIZA_BACKUP_PGPASSFILE="$work/pgpass"
bash "$script" backup "$work/storage"
archive="$(find "$work/storage" -maxdepth 1 -name '*.pgcustom.gpg' -print -quit)"
[[ -n "$archive" && -f "$archive.sha256" ]]
[[ "$(stat -c %a -- "$archive")" == 600 ]]
bash "$script" verify "$archive"
export COTIZA_RESTORE_PGHOST=127.0.0.1 COTIZA_RESTORE_PGUSER=synthetic
export COTIZA_RESTORE_PGDATABASE=cotiza_restore_synthetic COTIZA_RESTORE_PGPASSFILE="$work/pgpass"
export COTIZA_RESTORE_ACK=DISPOSABLE_LOCAL_DATABASE
bash "$script" restore-test "$archive"
if COTIZA_RESTORE_PGHOST=malicious.neon.tech bash "$script" restore-test "$archive" >/dev/null 2>&1; then echo 'Remote restore unexpectedly accepted' >&2; exit 1; fi
if COTIZA_RESTORE_PGDATABASE=neondb bash "$script" restore-test "$archive" >/dev/null 2>&1; then echo 'Production-like restore name unexpectedly accepted' >&2; exit 1; fi
if MOCK_PG_IS_NOT_EMPTY=1 bash "$script" restore-test "$archive" >/dev/null 2>&1; then echo 'Nonempty local database unexpectedly accepted' >&2; exit 1; fi
if COTIZA_BACKUP_PGHOST=ep-synthetic-pooler.c-3.us-east-1.aws.neon.tech bash "$script" backup "$work/storage" >/dev/null 2>&1; then echo 'Pooled source unexpectedly accepted' >&2; exit 1; fi
cp -- "$archive" "$work/storage/tampered.gpg"
cp -- "$archive.sha256" "$work/storage/tampered.gpg.sha256"
printf 'CORRUPTED\n' >> "$work/storage/tampered.gpg"
if bash "$script" verify "$work/storage/tampered.gpg" >/dev/null 2>&1; then echo 'Tampered archive unexpectedly accepted' >&2; exit 1; fi
if find "$work/storage" -maxdepth 1 -type f ! -name '*.gpg' ! -name '*.sha256' | grep -q .; then echo 'Unexpected plaintext artifact' >&2; exit 1; fi
printf 'PASS: synthetic encrypted stream, checksum, no plaintext, local restore and 5 guard cases\n'
