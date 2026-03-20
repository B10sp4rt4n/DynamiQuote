"""
Migración: Agregar campo project_description a formal_proposals
Ejecutar: python migrate_add_project_description.py
"""

import os
from dotenv import load_dotenv

load_dotenv()


def migrate():
    """Agrega campo project_description a formal_proposals"""

    database_url = os.environ.get('DATABASE_URL')

    if not database_url:
        print("❌ DATABASE_URL no configurado")
        return False

    try:
        import psycopg2
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()

        print("📦 Agregando campo project_description a formal_proposals...")

        try:
            cur.execute("""
                ALTER TABLE formal_proposals
                ADD COLUMN IF NOT EXISTS project_description TEXT
            """)
            print("✅ Campo project_description agregado")
        except Exception as e:
            print(f"ℹ️  Campo project_description ya existe o error: {e}")

        conn.commit()
        print("✅ Migración completada exitosamente")

        cur.close()
        conn.close()
        return True

    except Exception as e:
        print(f"❌ Error en migración: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    print("🔄 Iniciando migración: project_description en propuestas formales")
    print("=" * 60)
    success = migrate()
    print("=" * 60)
    if success:
        print("✅ Migración completada")
    else:
        print("❌ Migración fallida")
