"""
Migración: Agregar campos quoted_by y proposal_name a la tabla quotes
"""
import os
from database import get_cursor, is_postgres

def migrate():
    """Agrega los campos quoted_by y proposal_name a la tabla quotes."""
    
    print("🔄 Iniciando migración: Agregar quoted_by y proposal_name a quotes")
    
    try:
        with get_cursor() as cur:
            if is_postgres():
                # PostgreSQL
                cur.execute("""
                    ALTER TABLE quotes 
                    ADD COLUMN IF NOT EXISTS quoted_by TEXT;
                """)
                cur.execute("""
                    ALTER TABLE quotes 
                    ADD COLUMN IF NOT EXISTS proposal_name TEXT;
                """)
                print("✅ Campos quoted_by y proposal_name agregados en PostgreSQL")
            else:
                # SQLite - verificar si ya existen
                cur.execute("PRAGMA table_info(quotes)")
                columns = [row[1] for row in cur.fetchall()]
                
                if 'quoted_by' not in columns:
                    cur.execute("""
                        ALTER TABLE quotes 
                        ADD COLUMN quoted_by TEXT;
                    """)
                    print("✅ Campo quoted_by agregado en SQLite")
                else:
                    print("ℹ️ Campo quoted_by ya existe en SQLite")
                
                if 'proposal_name' not in columns:
                    cur.execute("""
                        ALTER TABLE quotes 
                        ADD COLUMN proposal_name TEXT;
                    """)
                    print("✅ Campo proposal_name agregado en SQLite")
                else:
                    print("ℹ️ Campo proposal_name ya existe en SQLite")
        
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
