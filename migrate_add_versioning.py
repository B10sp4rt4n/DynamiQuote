"""
Script de migración para agregar versionado a cotizaciones existentes.
Agrega: quote_group_id, version, parent_quote_id
"""
import sqlite3
import os
from dotenv import load_dotenv

load_dotenv()

# Detectar base de datos
DATABASE_URL = os.getenv('DATABASE_URL')

def migrate_sqlite():
    """Migra SQLite local."""
    print("🔄 Migrando SQLite...")
    
    conn = sqlite3.connect("quotes_mvp.db")
    cur = conn.cursor()
    
    try:
        # Verificar si las columnas ya existen
        cur.execute("PRAGMA table_info(quotes)")
        columns = [col[1] for col in cur.fetchall()]
        
        if 'quote_group_id' in columns:
            print("✅ Las columnas de versionado ya existen")
            return
        
        # Agregar columnas nuevas
        print("➕ Agregando columnas: quote_group_id, version, parent_quote_id")
        
        cur.execute("ALTER TABLE quotes ADD COLUMN quote_group_id TEXT")
        cur.execute("ALTER TABLE quotes ADD COLUMN version INTEGER DEFAULT 1")
        cur.execute("ALTER TABLE quotes ADD COLUMN parent_quote_id TEXT")
        
        # Actualizar registros existentes (cada uno es su propio grupo v1)
        cur.execute("UPDATE quotes SET quote_group_id = quote_id WHERE quote_group_id IS NULL")
        cur.execute("UPDATE quotes SET version = 1 WHERE version IS NULL")
        
        conn.commit()
        print("✅ Migración SQLite completada")
        
    except Exception as e:
        print(f"❌ Error en migración SQLite: {e}")
        conn.rollback()
    finally:
        conn.close()


def migrate_postgresql():
    """Migra PostgreSQL (Neon)."""
    print("🔄 Migrando PostgreSQL...")
    
    try:
        import psycopg2
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        try:
            # Verificar si las columnas ya existen
            cur.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='quotes'
            """)
            columns = [col[0] for col in cur.fetchall()]
            
            if 'quote_group_id' in columns:
                print("✅ Las columnas de versionado ya existen")
                return
            
            # Agregar columnas nuevas
            print("➕ Agregando columnas: quote_group_id, version, parent_quote_id")
            
            cur.execute("ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_group_id TEXT")
            cur.execute("ALTER TABLE quotes ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1")
            cur.execute("ALTER TABLE quotes ADD COLUMN IF NOT EXISTS parent_quote_id TEXT")
            
            # Actualizar registros existentes
            cur.execute("UPDATE quotes SET quote_group_id = quote_id WHERE quote_group_id IS NULL")
            cur.execute("UPDATE quotes SET version = 1 WHERE version IS NULL")
            
            conn.commit()
            print("✅ Migración PostgreSQL completada")
            
        except Exception as e:
            print(f"❌ Error en migración PostgreSQL: {e}")
            conn.rollback()
        finally:
            cur.close()
            conn.close()
            
    except ImportError:
        print("❌ psycopg2 no instalado. Ejecuta: pip install psycopg2-binary")
    except Exception as e:
        print(f"❌ Error conectando a PostgreSQL: {e}")


if __name__ == "__main__":
    print("🚀 Iniciando migración de versionado...")
    print("=" * 60)
    
    if DATABASE_URL and DATABASE_URL.startswith("postgresql"):
        migrate_postgresql()
    else:
        migrate_sqlite()
    
    print("=" * 60)
    print("✅ Migración completada. Reinicia la aplicación.")
