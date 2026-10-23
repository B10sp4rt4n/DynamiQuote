#!/usr/bin/env bash
# Offline-friendly, credential-free-in-logs Neon backup and local restore rehearsal.
# This file deliberately does not provision storage, create Neon branches or modify production.
set -Eeuo pipefail
umask 077

usage() {
  cat >&2 <<'EOF'
Usage:
  cotiza_backup_encrypted.sh backup DESTINATION_DIRECTORY
  cotiza_backup_encrypted.sh verify ENCRYPTED_ARCHIVE
  cotiza_backup_encrypted.sh restore-test ENCRYPTED_ARCHIVE

backup requires: COTIZA_BACKUP_PGHOST (direct, unpooled *.neon.tech endpoint),
  COTIZA_BACKUP_PGUSER, COTIZA_BACKUP_PGDATABASE=neondb,
  COTIZA_BACKUP_PGPASSFILE (0600, not tracked),
  COTIZA_BACKUP_GPG_FINGERPRINT (40 hex characters, preapproved local public key).
Optional: COTIZA_BACKUP_PGPORT=5432.

restore-test requires: COTIZA_RESTORE_PGHOST=127.0.0.1 or localhost,
  COTIZA_RESTORE_PGDATABASE=cotiza_restore_... (already created and EMPTY),
  COTIZA_RESTORE_PGUSER, COTIZA_RESTORE_PGPASSFILE (0600),
  COTIZA_RESTORE_ACK=DISPOSABLE_LOCAL_DATABASE, optional COTIZA_RESTORE_PGPORT=5432.
Only the disposable LOCAL database is changed by restore-test. The source is never modified.

Never commit, email, upload, or log a database archive or its connection credentials.
EOF
}

need() { command -v "$1" >/dev/null 2>&1 || { printf 'Missing tool: %s\n' "$1" >&2; exit 2; }; }
required() { [[ -n "${!1:-}" ]] || { printf 'Missing required setting: %s\n' "$1" >&2; exit 2; }; }
check_passfile() {
  local file="$1" permissions
  [[ -f "$file" && ! -L "$file" ]] || { echo 'Password file must be an existing regular non-symlink file' >&2; exit 2; }
  permissions="$(stat -c '%a' -- "$file")"
  [[ "$permissions" =~ ^[0-7]+$ ]] || exit 2
  if (( (8#$permissions & 077) != 0 )); then
    echo 'Password file must not be readable by group or others (chmod 600)' >&2
    exit 2
  fi
}
check_source() {
  required COTIZA_BACKUP_PGHOST
  required COTIZA_BACKUP_PGUSER
  required COTIZA_BACKUP_PGDATABASE
  required COTIZA_BACKUP_PGPASSFILE
  required COTIZA_BACKUP_GPG_FINGERPRINT
  [[ "$COTIZA_BACKUP_PGHOST" == *.neon.tech && "$COTIZA_BACKUP_PGHOST" != *-pooler* ]] || {
    echo 'Backup requires a direct, UNPOOLED Neon hostname' >&2; exit 2;
  }
  [[ "$COTIZA_BACKUP_PGDATABASE" == neondb ]] || { echo 'Unexpected source database' >&2; exit 2; }
  [[ "$COTIZA_BACKUP_GPG_FINGERPRINT" =~ ^[[:xdigit:]]{40}$ ]] || { echo 'Expected a complete 40-character GPG fingerprint' >&2; exit 2; }
  check_passfile "$COTIZA_BACKUP_PGPASSFILE"
  gpg --batch --list-keys "$COTIZA_BACKUP_GPG_FINGERPRINT" >/dev/null 2>&1 || {
    echo 'Approved GPG public key not found in local keyring' >&2; exit 2;
  }
}
check_archive() {
  [[ -f "$1" && ! -L "$1" && -f "$1.sha256" ]] || { echo 'Encrypted archive/checksum missing' >&2; exit 2; }
  local expected actual
  expected="$(cat -- "$1.sha256")"
  [[ "$expected" =~ ^[[:xdigit:]]{64}$ ]] || { echo 'Invalid checksum manifest' >&2; exit 2; }
  actual="$(sha256sum < "$1")"
  actual="${actual%% *}"
  [[ "$expected" == "$actual" ]] || { echo 'Archive checksum mismatch' >&2; exit 2; }
}
verify_archive() {
  local archive="$1" toc
  check_archive "$archive"
  toc="$(mktemp)"
  trap 'rm -f -- "$toc"' RETURN
  gpg --batch --quiet --decrypt -- "$archive" | pg_restore --list >"$toc"
  for relation in tenants quotes proposals formal_proposals; do
    grep -Eq "TABLE DATA[[:space:]]+public[[:space:]]+$relation([[:space:]]|$)" "$toc" || {
      printf 'Expected table data missing from backup: %s\n' "$relation" >&2; return 1;
    }
  done
  printf 'Encrypted archive checksum and archive table-of-contents verified. No plaintext file created.\n'
}

mode="${1:-}"
case "$mode" in
  backup)
    [[ $# == 2 ]] || { usage; exit 2; }
    need pg_dump; need pg_restore; need gpg; need sha256sum; need stat
    check_source
    directory="$2"
    [[ -d "$directory" && ! -L "$directory" ]] || { echo 'Destination must be an existing local directory' >&2; exit 2; }
    directory="$(cd -- "$directory" && pwd -P)"
    [[ "$directory" != /tmp* && "$directory" != /var/tmp* && "$directory" != /mnt/data* ]] || {
      echo 'Do not store real backups in a temporary or conversation-files directory' >&2; exit 2;
    }
    now="$(date -u +'%Y%m%dT%H%M%SZ')"
    final="$directory/dynamiquote-neon-$now.pgcustom.gpg"
    [[ ! -e "$final" && ! -e "$final.sha256" ]] || { echo 'Archive already exists; never overwrite a backup' >&2; exit 2; }
    tmp="$(mktemp "$directory/.encrypted-backup.XXXXXXXXXX")"
    cleanup() { rm -f -- "$tmp"; }
    trap cleanup EXIT
    (
      export PGHOST="$COTIZA_BACKUP_PGHOST" PGPORT="${COTIZA_BACKUP_PGPORT:-5432}"
      export PGUSER="$COTIZA_BACKUP_PGUSER" PGDATABASE="$COTIZA_BACKUP_PGDATABASE"
      export PGPASSFILE="$COTIZA_BACKUP_PGPASSFILE" PGSSLMODE=verify-full
      pg_dump --no-password --format=custom --no-owner --no-acl --dbname="$PGDATABASE" \
        | gpg --batch --yes --trust-model always --encrypt \
            --recipient "$COTIZA_BACKUP_GPG_FINGERPRINT" --output "$tmp"
    )
    chmod 600 -- "$tmp"
    # Verify complete encrypted archive before exposing its final name.
    gpg --batch --quiet --decrypt -- "$tmp" | pg_restore --list >/dev/null
    mv -- "$tmp" "$final"
    trap - EXIT
    sha256sum < "$final" | cut -d ' ' -f1 >"$final.sha256"
    chmod 600 -- "$final" "$final.sha256"
    printf 'Encrypted local backup created: %s\n' "$final"
    printf 'NEXT: run verify then restore-test against an empty local disposable database.\n'
    ;;
  verify)
    [[ $# == 2 ]] || { usage; exit 2; }
    need gpg; need pg_restore; need sha256sum
    verify_archive "$2"
    ;;
  restore-test)
    [[ $# == 2 ]] || { usage; exit 2; }
    need pg_restore; need gpg; need sha256sum; need psql; need stat
    required COTIZA_RESTORE_PGHOST
    required COTIZA_RESTORE_PGDATABASE
    required COTIZA_RESTORE_PGUSER
    required COTIZA_RESTORE_PGPASSFILE
    required COTIZA_RESTORE_ACK
    [[ "$COTIZA_RESTORE_ACK" == DISPOSABLE_LOCAL_DATABASE ]] || { echo 'Explicit disposable-only acknowledgement required' >&2; exit 2; }
    [[ "$COTIZA_RESTORE_PGHOST" == 127.0.0.1 || "$COTIZA_RESTORE_PGHOST" == localhost || "$COTIZA_RESTORE_PGHOST" == ::1 ]] || {
      echo 'Remote restore prohibited. Use a local, disposable PostgreSQL server' >&2; exit 2;
    }
    [[ "$COTIZA_RESTORE_PGDATABASE" == cotiza_restore_* ]] || { echo 'Unexpected restore database name' >&2; exit 2; }
    check_passfile "$COTIZA_RESTORE_PGPASSFILE"
    verify_archive "$2"
    (
      export PGHOST="$COTIZA_RESTORE_PGHOST" PGPORT="${COTIZA_RESTORE_PGPORT:-5432}"
      export PGUSER="$COTIZA_RESTORE_PGUSER" PGDATABASE="$COTIZA_RESTORE_PGDATABASE"
      export PGPASSFILE="$COTIZA_RESTORE_PGPASSFILE" PGSSLMODE=prefer
      # Never drop/create the test database; require an existing empty database.
      # This avoids a dangerous user-supplied command that might target production.
      check_empty="$(psql --no-psqlrc --no-password --tuples-only --no-align \
        --set ON_ERROR_STOP=1 --dbname="$PGDATABASE" \
        --command="SELECT COUNT(*) FROM pg_catalog.pg_tables WHERE schemaname='public';")"
      [[ "$check_empty" == 0 ]] || { echo 'Restore target is not empty; refusing to overwrite anything' >&2; exit 2; }
      gpg --batch --quiet --decrypt -- "$2" \
        | pg_restore --no-owner --no-privileges --no-password --single-transaction \
            --exit-on-error --dbname="$PGDATABASE"
      psql --no-psqlrc --no-password --tuples-only --no-align \
        --set ON_ERROR_STOP=1 --dbname="$PGDATABASE" \
        --command="SELECT 'tenants='||(SELECT COUNT(*) FROM tenants)||';quotes='||(SELECT COUNT(*) FROM quotes)||';proposals='||(SELECT COUNT(*) FROM proposals)||';formal_proposals='||(SELECT COUNT(*) FROM formal_proposals);"
    )
    printf 'LOCAL disposable database restored. Validate business and fiscal evidence before approving a cutover.\n'
    ;;
  *) usage; exit 2 ;;
esac
