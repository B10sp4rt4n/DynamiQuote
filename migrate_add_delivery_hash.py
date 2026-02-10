"""
Migración: Agregar campos para hash de entrega de propuestas
Ejecutar: python migrate_add_delivery_hash.py
"""

import os
from datetime import datetime, UTC
import psycopg2
from psycopg2 import sql
from dotenv import load_dotenv

load_dotenv()

def migrate():
    """Agrega campos delivery_hash y delivered_at a formal_proposals"""
    
    # Obtener DATABASE_URL
    database_url = os.environ.get('DATABASE_URL')
    
    if not database_url:
        print("❌ DATABASE_URL no configurado")
        return False
        
    try:
        # Conectar a PostgreSQL
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        
        print("📦 Agregando campos de entrega a formal_proposals...")
        
        # Agregar columna delivery_hash
        try:
            cur.execute("""
                ALTER TABLE formal_proposals 
                ADD COLUMN IF NOT EXISTS delivery_hash TEXT UNIQUE
            """)
            print("✅ Campo delivery_hash agregado")
        except Exception as e:
            print(f"ℹ️  Campo delivery_hash ya existe o error: {e}")
        
        # Agregar columna delivery_number (consecutivo)
        try:
            cur.execute("""
                ALTER TABLE formal_proposals 
                ADD COLUMN IF NOT EXISTS delivery_number TEXT UNIQUE
            """)
            print("✅ Campo delivery_number agregado")
        except Exception as e:
            print(f"ℹ️  Campo delivery_number ya existe o error: {e}")
        
        # Agregar columna delivered_at
        try:
            cur.execute("""
                ALTER TABLE formal_proposals 
                ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP
            """)
            print("✅ Campo delivered_at agregado")
        except Exception as e:
            print(f"ℹ️  Campo delivered_at ya existe o error: {e}")
        
        # Agregar columna delivered_by
        try:
            cur.execute("""
                ALTER TABLE formal_proposals 
                ADD COLUMN IF NOT EXISTS delivered_by TEXT
            """)
            print("✅ Campo delivered_by agregado")
        except Exception as e:
            print(f"ℹ️  Campo delivered_by ya existe o error: {e}")
        
        # Crear índice en delivery_hash
        try:
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_formal_proposals_delivery_hash 
                ON formal_proposals(delivery_hash)
            """)
            print("✅ Índice idx_formal_proposals_delivery_hash creado")
        except Exception as e:
            print(f"ℹ️  Índice ya existe o error: {e}")
        
        # Crear índice en status para filtrado eficiente
        try:
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_formal_proposals_status_created 
                ON formal_proposals(status, created_at DESC)
            """)
            print("✅ Índice idx_formal_proposals_status_created creado")
        except Exception as e:
            print(f"ℹ️  Índice ya existe o error: {e}")
        
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
    print("🔄 Iniciando migración: campos de entrega de propuestas")
    print("=" * 60)
    success = migrate()
    print("=" * 60)
    if success:
        print("✅ Migración completada")
    else:
        print("❌ Migración fallida")
