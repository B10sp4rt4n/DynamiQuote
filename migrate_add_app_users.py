"""
Migración: Crear tabla app_users para sistema de autenticación.
Ejecutar: python migrate_add_app_users.py
"""
import os
from dotenv import load_dotenv

load_dotenv()


def migrate():
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        print("❌ DATABASE_URL no configurado")
        return False
    try:
        import psycopg2
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()

        print("📦 Creando tabla app_users...")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS app_users (
                user_id TEXT PRIMARY KEY,
                alias TEXT UNIQUE NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP NOT NULL
            )
        """)
        print("✅ Tabla app_users creada")

        conn.commit()
        cur.close()
        conn.close()
        return True
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    print("🔄 Iniciando migración: app_users")
    print("=" * 60)
    success = migrate()
    print("=" * 60)
    print("✅ Completado" if success else "❌ Fallido")
