"""
Migración: Soporte Multitenant
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Agrega las siguientes columnas a tablas existentes:
  - tenants              → tabla nueva
  - app_users            → tenant_id, seller_code
  - quotes               → tenant_id, created_by_user_id
  - formal_proposals     → tenant_id
  - import_files         → tenant_id
  - company_logos        → tenant_id

Compatible con PostgreSQL y SQLite.
Los datos existentes quedan con tenant_id = NULL (accesibles por superadmin).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from database import get_cursor, is_postgres


def _column_exists(cur, table: str, column: str) -> bool:
    """Verifica si una columna existe en una tabla."""
    if is_postgres():
        cur.execute("""
            SELECT COUNT(*) FROM information_schema.columns
            WHERE table_name = %s AND column_name = %s
        """, (table, column))
    else:
        cur.execute(f"PRAGMA table_info({table})")
        rows = cur.fetchall()
        return any(row[1] == column for row in rows)
    return cur.fetchone()[0] > 0


def _table_exists(cur, table: str) -> bool:
    """Verifica si una tabla existe."""
    if is_postgres():
        cur.execute("""
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_name = %s
        """, (table,))
        return cur.fetchone()[0] > 0
    else:
        cur.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", (table,))
        return cur.fetchone()[0] > 0


def migrate() -> bool:
    """Ejecuta la migración multitenant. Retorna True si tuvo éxito."""
    print("🔄 Migración: multitenant — inicio")

    try:
        with get_cursor() as cur:

            # ── 1. Tabla tenants ────────────────────────────────────────
            if not _table_exists(cur, "tenants"):
                print("  ➕ Creando tabla tenants...")
                if is_postgres():
                    cur.execute("""
                        CREATE TABLE tenants (
                            tenant_id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            slug TEXT UNIQUE NOT NULL,
                            active BOOLEAN NOT NULL DEFAULT TRUE,
                            created_at TIMESTAMP NOT NULL
                        )
                    """)
                else:
                    cur.execute("""
                        CREATE TABLE tenants (
                            tenant_id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            slug TEXT UNIQUE NOT NULL,
                            active INTEGER NOT NULL DEFAULT 1,
                            created_at TEXT NOT NULL
                        )
                    """)
                print("  ✅ Tabla tenants creada")
            else:
                print("  ✔️  Tabla tenants ya existe")

            # ── 2. app_users: tenant_id ─────────────────────────────────
            if not _column_exists(cur, "app_users", "tenant_id"):
                print("  ➕ app_users.tenant_id...")
                if is_postgres():
                    cur.execute("ALTER TABLE app_users ADD COLUMN tenant_id TEXT REFERENCES tenants(tenant_id)")
                else:
                    cur.execute("ALTER TABLE app_users ADD COLUMN tenant_id TEXT")
                print("  ✅ app_users.tenant_id agregado")
            else:
                print("  ✔️  app_users.tenant_id ya existe")

            # ── 3. app_users: seller_code ───────────────────────────────
            if not _column_exists(cur, "app_users", "seller_code"):
                print("  ➕ app_users.seller_code...")
                cur.execute("ALTER TABLE app_users ADD COLUMN seller_code TEXT")
                print("  ✅ app_users.seller_code agregado")
            else:
                print("  ✔️  app_users.seller_code ya existe")

            # ── 4. quotes: tenant_id ────────────────────────────────────
            if not _column_exists(cur, "quotes", "tenant_id"):
                print("  ➕ quotes.tenant_id...")
                if is_postgres():
                    cur.execute("ALTER TABLE quotes ADD COLUMN tenant_id TEXT REFERENCES tenants(tenant_id)")
                else:
                    cur.execute("ALTER TABLE quotes ADD COLUMN tenant_id TEXT")
                print("  ✅ quotes.tenant_id agregado")
            else:
                print("  ✔️  quotes.tenant_id ya existe")

            # ── 5. quotes: created_by_user_id ───────────────────────────
            if not _column_exists(cur, "quotes", "created_by_user_id"):
                print("  ➕ quotes.created_by_user_id...")
                cur.execute("ALTER TABLE quotes ADD COLUMN created_by_user_id TEXT")
                print("  ✅ quotes.created_by_user_id agregado")
            else:
                print("  ✔️  quotes.created_by_user_id ya existe")

            # ── 6. formal_proposals: tenant_id ─────────────────────────
            if _table_exists(cur, "formal_proposals"):
                if not _column_exists(cur, "formal_proposals", "tenant_id"):
                    print("  ➕ formal_proposals.tenant_id...")
                    if is_postgres():
                        cur.execute("ALTER TABLE formal_proposals ADD COLUMN tenant_id TEXT REFERENCES tenants(tenant_id)")
                    else:
                        cur.execute("ALTER TABLE formal_proposals ADD COLUMN tenant_id TEXT")
                    print("  ✅ formal_proposals.tenant_id agregado")
                else:
                    print("  ✔️  formal_proposals.tenant_id ya existe")

            # ── 7. import_files: tenant_id ──────────────────────────────
            if _table_exists(cur, "import_files"):
                if not _column_exists(cur, "import_files", "tenant_id"):
                    print("  ➕ import_files.tenant_id...")
                    if is_postgres():
                        cur.execute("ALTER TABLE import_files ADD COLUMN tenant_id TEXT REFERENCES tenants(tenant_id)")
                    else:
                        cur.execute("ALTER TABLE import_files ADD COLUMN tenant_id TEXT")
                    print("  ✅ import_files.tenant_id agregado")
                else:
                    print("  ✔️  import_files.tenant_id ya existe")

            # ── 8. company_logos: tenant_id ─────────────────────────────
            if _table_exists(cur, "company_logos"):
                if not _column_exists(cur, "company_logos", "tenant_id"):
                    print("  ➕ company_logos.tenant_id...")
                    if is_postgres():
                        cur.execute("ALTER TABLE company_logos ADD COLUMN tenant_id TEXT REFERENCES tenants(tenant_id)")
                    else:
                        cur.execute("ALTER TABLE company_logos ADD COLUMN tenant_id TEXT")
                    print("  ✅ company_logos.tenant_id agregado")
                else:
                    print("  ✔️  company_logos.tenant_id ya existe")

        print("✅ Migración multitenant completada")
        return True

    except Exception as e:
        print(f"❌ Error en migración multitenant: {e}")
        return False


if __name__ == "__main__":
    ok = migrate()
    sys.exit(0 if ok else 1)
