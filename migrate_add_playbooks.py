"""
Migración: Agregar campo playbook_name a tabla quotes existente.

Este script agrega el campo playbook_name con valor default 'General' 
a todas las cotizaciones existentes.

Fecha: 21 Enero 2026
Versión: 2.3
"""

import os
import sys
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')

if DATABASE_URL and 'postgresql' in DATABASE_URL:
    print("🔄 Ejecutando migración en PostgreSQL...")
    
    import psycopg2
    from urllib.parse import urlparse
    
    # Parsear URL
    url = urlparse(DATABASE_URL)
    
    try:
        # Conectar a PostgreSQL
        conn = psycopg2.connect(
            host=url.hostname,
            port=url.port,
            user=url.username,
            password=url.password,
            database=url.path[1:],
            sslmode='require'
        )
        
        cur = conn.cursor()
        
        # 1. Verificar si la columna ya existe
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='quotes' AND column_name='playbook_name'
        """)
        
        if cur.fetchone():
            print("✅ La columna 'playbook_name' ya existe. No se requiere migración.")
            sys.exit(0)
        
        # 2. Agregar columna playbook_name
        print("📝 Agregando columna playbook_name...")
        cur.execute("""
            ALTER TABLE quotes 
            ADD COLUMN playbook_name TEXT DEFAULT 'General'
        """)
        
        # 3. Actualizar registros existentes (por si acaso)
        cur.execute("""
            UPDATE quotes 
            SET playbook_name = 'General' 
            WHERE playbook_name IS NULL
        """)
        
        affected = cur.rowcount
        
        # Commit
        conn.commit()
        
        print(f"✅ Migración completada exitosamente")
        print(f"   - Columna 'playbook_name' agregada")
        print(f"   - {affected} registros actualizados con playbook 'General'")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Error en migración PostgreSQL: {e}")
        sys.exit(1)

else:
    print("🔄 Ejecutando migración en SQLite local...")
    
    import sqlite3
    
    try:
        # Conectar a SQLite
        conn = sqlite3.connect("cotizaciones.db")
        cur = conn.cursor()
        
        # 1. Verificar si la columna ya existe
        cur.execute("PRAGMA table_info(quotes)")
        columns = [row[1] for row in cur.fetchall()]
        
        if 'playbook_name' in columns:
            print("✅ La columna 'playbook_name' ya existe. No se requiere migración.")
            sys.exit(0)
        
        # 2. Agregar columna playbook_name
        print("📝 Agregando columna playbook_name...")
        cur.execute("""
            ALTER TABLE quotes 
            ADD COLUMN playbook_name TEXT DEFAULT 'General'
        """)
        
        # 3. Actualizar registros existentes
        cur.execute("""
            UPDATE quotes 
            SET playbook_name = 'General' 
            WHERE playbook_name IS NULL
        """)
        
        affected = cur.rowcount
        
        # Commit
        conn.commit()
        
        print(f"✅ Migración completada exitosamente")
        print(f"   - Columna 'playbook_name' agregada")
        print(f"   - {affected} registros actualizados con playbook 'General'")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Error en migración SQLite: {e}")
        sys.exit(1)

print("\n🎯 Próximos pasos:")
print("   1. Reinicia la aplicación Streamlit")
print("   2. Al crear nuevas cotizaciones, selecciona el playbook apropiado")
print("   3. Las cotizaciones existentes usarán playbook 'General' por defecto")
print("   4. En el comparador, el playbook ajustará umbrales de salud automáticamente")
