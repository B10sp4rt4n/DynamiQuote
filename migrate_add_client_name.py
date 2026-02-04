"""
Migración: Agregar campo client_name a la tabla quotes
"""
import os
from database import get_cursor, is_postgres

def migrate():
    """Agrega el campo client_name a la tabla quotes."""
    
    print("🔄 Iniciando migración: Agregar client_name a quotes")
    
    try:
        with get_cursor() as cur:
            if is_postgres():
                # PostgreSQL
                cur.execute("""
                    ALTER TABLE quotes 
                    ADD COLUMN IF NOT EXISTS client_name TEXT;
                """)
                print("✅ Campo client_name agregado en PostgreSQL")
            else:
                # SQLite - verificar si ya existe
                cur.execute("PRAGMA table_info(quotes)")
                columns = [row[1] for row in cur.fetchall()]
                
                if 'client_name' not in columns:
                    cur.execute("""
                        ALTER TABLE quotes 
                        ADD COLUMN client_name TEXT;
                    """)
                    print("✅ Campo client_name agregado en SQLite")
                else:
                    print("ℹ️ Campo client_name ya existe en SQLite")
        
        print("✅ Migración completada exitosamente")
        return True
        
    except Exception as e:
        print(f"❌ Error en migración: {e}")
        return False

if __name__ == "__main__":
    success = migrate()
    if success:
        print("🎉 Migración ejecutada correctamente")
    else:
        print("💥 Migración falló")
