"""
Migración: Agregar campos de trazabilidad de importación
- import_source: 'manual' | 'excel'
- import_batch_id: UUID que agrupa líneas del mismo Excel
- Tabla import_files: guarda Excel original para auditoría
"""

import os
import sqlite3
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')
SQLITE_DB = "quotes_mvp.db"

def is_postgres():
    """Verifica si se debe usar PostgreSQL."""
    return DATABASE_URL is not None and DATABASE_URL.strip() != ""


def migrate_postgres():
    """Aplica migración en PostgreSQL."""
    try:
        import psycopg2
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        print("📊 Migrando PostgreSQL...")
        
        # 1. Agregar columnas a quote_lines
        try:
            cur.execute("ALTER TABLE quote_lines ADD COLUMN import_source TEXT DEFAULT 'manual'")
            print("✅ Columna import_source agregada")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("⚠️ Columna import_source ya existe")
            else:
                raise
        
        try:
            cur.execute("ALTER TABLE quote_lines ADD COLUMN import_batch_id TEXT")
            print("✅ Columna import_batch_id agregada")
        except Exception as e:
            if "already exists" in str(e).lower():
                print("⚠️ Columna import_batch_id ya existe")
            else:
                raise
        
        # 2. Crear tabla import_files
        cur.execute("""
            CREATE TABLE IF NOT EXISTS import_files (
                file_id TEXT PRIMARY KEY,
                quote_id TEXT REFERENCES quotes(quote_id),
                filename TEXT NOT NULL,
                uploaded_at TIMESTAMP NOT NULL,
                file_data BYTEA NOT NULL,
                file_size INTEGER,
                rows_imported INTEGER,
                rows_errors INTEGER
            )
        """)
        print("✅ Tabla import_files creada")
        
        conn.commit()
        cur.close()
        conn.close()
        
        print("✅ Migración PostgreSQL completada")
        return True
        
    except Exception as e:
        print(f"❌ Error en migración PostgreSQL: {e}")
        return False


def migrate_sqlite():
    """Aplica migración en SQLite."""
    try:
        conn = sqlite3.connect(SQLITE_DB)
        cur = conn.cursor()
        
        print("📊 Migrando SQLite...")
        
        # 1. Verificar si columnas ya existen
        cur.execute("PRAGMA table_info(quote_lines)")
        existing_columns = [col[1] for col in cur.fetchall()]
        
        if 'import_source' not in existing_columns:
            cur.execute("ALTER TABLE quote_lines ADD COLUMN import_source TEXT DEFAULT 'manual'")
            print("✅ Columna import_source agregada")
        else:
            print("⚠️ Columna import_source ya existe")
        
        if 'import_batch_id' not in existing_columns:
            cur.execute("ALTER TABLE quote_lines ADD COLUMN import_batch_id TEXT")
            print("✅ Columna import_batch_id agregada")
        else:
            print("⚠️ Columna import_batch_id ya existe")
        
        # 2. Crear tabla import_files
        cur.execute("""
            CREATE TABLE IF NOT EXISTS import_files (
                file_id TEXT PRIMARY KEY,
                quote_id TEXT,
                filename TEXT NOT NULL,
                uploaded_at TEXT NOT NULL,
                file_data BLOB NOT NULL,
                file_size INTEGER,
                rows_imported INTEGER,
                rows_errors INTEGER,
                FOREIGN KEY (quote_id) REFERENCES quotes(quote_id)
            )
        """)
        print("✅ Tabla import_files creada")
        
        conn.commit()
        cur.close()
        conn.close()
        
        print("✅ Migración SQLite completada")
        return True
        
    except Exception as e:
        print(f"❌ Error en migración SQLite: {e}")
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("🔄 MIGRACIÓN: Import Tracking")
    print("=" * 60)
    
    if is_postgres():
        success = migrate_postgres()
    else:
        success = migrate_sqlite()
    
    if success:
        print("\n✅ Migración completada exitosamente")
    else:
        print("\n❌ Migración falló")
        exit(1)
