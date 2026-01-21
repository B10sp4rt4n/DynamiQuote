"""
Script de migración de datos de SQLite a PostgreSQL (Neon).
Ejecuta este script una sola vez para migrar tus datos existentes.
"""

import sqlite3
import os
from database import get_cursor, is_postgres

SQLITE_DB = "quotes_mvp.db"


def migrate_data():
    """Migra datos de SQLite a PostgreSQL."""
    
    if not is_postgres():
        print("❌ No hay configuración de PostgreSQL en DATABASE_URL")
        print("Configura tu Neon database en el archivo .env")
        return False
    
    if not os.path.exists(SQLITE_DB):
        print(f"❌ No se encontró archivo SQLite: {SQLITE_DB}")
        return False
    
    print("🔄 Iniciando migración de SQLite a PostgreSQL...")
    
    # Conectar a SQLite
    sqlite_conn = sqlite3.connect(SQLITE_DB)
    sqlite_cur = sqlite_conn.cursor()
    
    try:
        # Migrar quotes
        print("📊 Migrando cotizaciones...")
        quotes = sqlite_cur.execute("SELECT * FROM quotes").fetchall()
        
        with get_cursor() as pg_cur:
            for quote in quotes:
                pg_cur.execute(
                    """INSERT INTO quotes 
                       (quote_id, created_at, status, total_cost, total_revenue, gross_profit, avg_margin)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (quote_id) DO NOTHING""",
                    quote
                )
        
        print(f"✅ Migradas {len(quotes)} cotizaciones")
        
        # Migrar quote_lines
        print("📝 Migrando líneas de cotización...")
        lines = sqlite_cur.execute("SELECT * FROM quote_lines").fetchall()
        
        with get_cursor() as pg_cur:
            for line in lines:
                pg_cur.execute(
                    """INSERT INTO quote_lines 
                       (line_id, quote_id, sku, description_original, description_final,
                        description_corrections, line_type, service_origin, cost_unit,
                        final_price_unit, margin_pct, strategy, warnings, created_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (line_id) DO NOTHING""",
                    line
                )
        
        print(f"✅ Migradas {len(lines)} líneas")
        print("\n🎉 Migración completada exitosamente!")
        print(f"📦 Total: {len(quotes)} cotizaciones, {len(lines)} líneas")
        
        return True
        
    except Exception as e:
        print(f"❌ Error durante la migración: {e}")
        return False
    
    finally:
        sqlite_conn.close()


if __name__ == "__main__":
    print("=" * 60)
    print("MIGRACIÓN SQLITE → POSTGRESQL (NEON)")
    print("=" * 60)
    
    confirm = input("\n¿Deseas continuar con la migración? (s/n): ")
    
    if confirm.lower() in ['s', 'si', 'sí', 'y', 'yes']:
        success = migrate_data()
        
        if success:
            backup = input("\n¿Crear backup del archivo SQLite? (s/n): ")
            if backup.lower() in ['s', 'si', 'sí', 'y', 'yes']:
                import shutil
                shutil.copy(SQLITE_DB, f"{SQLITE_DB}.backup")
                print(f"✅ Backup creado: {SQLITE_DB}.backup")
    else:
        print("❌ Migración cancelada")
