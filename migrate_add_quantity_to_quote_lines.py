"""
Migración: Agregar campo quantity a quote_lines.

Este script agrega la columna quantity a la tabla quote_lines
para soportar cantidades diferentes de 1 en cada línea.

Ejecutar: python migrate_add_quantity_to_quote_lines.py
"""

import os
from datetime import datetime, UTC
from database import get_cursor, is_postgres


def migrate():
    """Ejecuta la migración para agregar quantity a quote_lines."""
    
    print("🚀 Iniciando migración: Agregar quantity a quote_lines")
    print(f"📊 Base de datos: {'PostgreSQL (Neon)' if is_postgres() else 'SQLite'}")
    print("-" * 60)
    
    try:
        with get_cursor() as cur:
            # Agregar columna quantity
            print("📦 Agregando columna quantity a quote_lines...")
            
            if is_postgres():
                # PostgreSQL
                cur.execute("""
                    ALTER TABLE quote_lines 
                    ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 1.0
                """)
            else:
                # SQLite - verificar si la columna existe primero
                cur.execute("PRAGMA table_info(quote_lines)")
                columns = [row[1] for row in cur.fetchall()]
                
                if 'quantity' not in columns:
                    # SQLite no soporta ADD COLUMN con DEFAULT directamente en todas las versiones
                    # Pero sí lo soporta en versiones modernas
                    cur.execute("""
                        ALTER TABLE quote_lines 
                        ADD COLUMN quantity REAL DEFAULT 1.0
                    """)
                else:
                    print("⚠️  Columna quantity ya existe en SQLite")
            
            print("✅ Columna quantity agregada exitosamente")
            
            # Actualizar registros existentes que tengan NULL
            print("🔄 Actualizando registros existentes sin cantidad...")
            
            if is_postgres():
                cur.execute("""
                    UPDATE quote_lines 
                    SET quantity = 1.0 
                    WHERE quantity IS NULL
                """)
            else:
                cur.execute("""
                    UPDATE quote_lines 
                    SET quantity = 1.0 
                    WHERE quantity IS NULL
                """)
            
            print("✅ Registros existentes actualizados")
        
        print("-" * 60)
        print("✅ Migración completada exitosamente")
        print(f"⏰ {datetime.now(UTC).strftime('%Y-%m-%d %H:%M:%S UTC')}")
        return True
        
    except Exception as e:
        print("-" * 60)
        print(f"❌ Error durante la migración: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = migrate()
    exit(0 if success else 1)
