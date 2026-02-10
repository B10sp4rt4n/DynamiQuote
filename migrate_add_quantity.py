"""
Migración: Agregar campo 'quantity' a la tabla quote_lines.

Esta migración añade el campo 'quantity' (cantidad) con valor por defecto 1
a todas las líneas de cotización existentes.
"""

from database import get_cursor, is_postgres

def migrate_add_quantity():
    """Agrega el campo quantity a quote_lines si no existe."""
    try:
        with get_cursor() as cur:
            # Verificar si la columna ya existe
            if is_postgres():
                cur.execute("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name='quote_lines' AND column_name='quantity'
                """)
            else:
                cur.execute("PRAGMA table_info(quote_lines)")
                columns = [row[1] for row in cur.fetchall()]
                if 'quantity' in columns:
                    print("✅ La columna 'quantity' ya existe en quote_lines")
                    return True, "Columna ya existe"
            
            # Agregar columna si no existe
            if is_postgres():
                if not cur.fetchone():
                    print("Agregando columna 'quantity' a quote_lines (PostgreSQL)...")
                    cur.execute("""
                        ALTER TABLE quote_lines 
                        ADD COLUMN quantity INTEGER DEFAULT 1
                    """)
                    print("✅ Columna 'quantity' agregada exitosamente")
                else:
                    print("✅ La columna 'quantity' ya existe en quote_lines")
            else:
                if 'quantity' not in columns:
                    print("Agregando columna 'quantity' a quote_lines (SQLite)...")
                    cur.execute("""
                        ALTER TABLE quote_lines 
                        ADD COLUMN quantity INTEGER DEFAULT 1
                    """)
                    print("✅ Columna 'quantity' agregada exitosamente")
            
            # Actualizar líneas existentes con quantity=1 si es NULL
            print("Actualizando líneas existentes con quantity=1...")
            cur.execute("""
                UPDATE quote_lines 
                SET quantity = 1 
                WHERE quantity IS NULL
            """)
            
            print("✅ Migración completada exitosamente")
            return True, "Migración exitosa"
            
    except Exception as e:
        print(f"❌ Error en migración: {e}")
        return False, f"Error: {e}"

if __name__ == "__main__":
    print("=== Migración: Agregar campo 'quantity' ===")
    success, message = migrate_add_quantity()
    if success:
        print("\n✅ Migración completada. La base de datos está actualizada.")
    else:
        print(f"\n❌ Migración falló: {message}")
