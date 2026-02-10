"""
Módulo de gestión de base de datos para DynamiQuote.
Soporta tanto PostgreSQL (Neon) como SQLite para desarrollo local.
"""

import os
import sqlite3
from contextlib import contextmanager
from typing import Optional, Generator
import streamlit as st
from dotenv import load_dotenv

# ====================================
# Configuración de Variables de Entorno
# ====================================

def get_database_url() -> Optional[str]:
    """
    Obtiene DATABASE_URL de forma automática según el entorno:
    1. Streamlit Cloud: usa st.secrets
    2. Local: usa .env file
    3. Fallback: variable de entorno del sistema
    
    Returns:
        str: URL de conexión a PostgreSQL o None para usar SQLite
    """
    # Prioridad 1: Streamlit Cloud (secrets.toml)
    try:
        if hasattr(st, 'secrets') and 'DATABASE_URL' in st.secrets:
            print("✅ Usando DATABASE_URL de Streamlit Cloud Secrets")
            return st.secrets['DATABASE_URL']
    except Exception:
        pass
    
    # Prioridad 2: Archivo .env local
    load_dotenv()
    database_url = os.getenv('DATABASE_URL')
    
    if database_url and database_url.strip():
        print("✅ Usando DATABASE_URL de archivo .env local")
        return database_url
    
    # Prioridad 3: Variable de entorno del sistema
    database_url = os.environ.get('DATABASE_URL')
    
    if database_url and database_url.strip():
        print("✅ Usando DATABASE_URL de variable de entorno del sistema")
        return database_url
    
    print("ℹ️  DATABASE_URL no encontrada. Usando SQLite local para desarrollo.")
    return None


# Obtener configuración
DATABASE_URL = get_database_url()
SQLITE_DB = "quotes_mvp.db"


def is_postgres() -> bool:
    """Verifica si se debe usar PostgreSQL."""
    return DATABASE_URL is not None and DATABASE_URL.strip() != ""


def _create_connection():
    """Crea una nueva conexión a la base de datos."""
    if is_postgres():
        try:
            import psycopg2
            conn = psycopg2.connect(DATABASE_URL)
            return conn
        except ImportError as e:
            raise ImportError("psycopg2 no está instalado. Ejecuta: pip install psycopg2-binary") from e
        except Exception as e:
            raise ConnectionError(f"Error conectando a PostgreSQL: {e}") from e
    else:
        return sqlite3.connect(SQLITE_DB, check_same_thread=False)


@st.cache_resource
def get_connection():
    """
    Obtiene conexión a la base de datos (PostgreSQL o SQLite).
    Usa caché de Streamlit para mantener una sola conexión.
    
    Para uso fuera de Streamlit, usa _create_connection() directamente.
    """
    return _create_connection()


@contextmanager
def get_cursor() -> Generator:
    """
    Context manager para operaciones de base de datos.
    Maneja automáticamente commit/rollback y cierre de cursor y conexión.
    
    Para PostgreSQL, crea una nueva conexión en cada operación.
    Para SQLite, usa la conexión cacheada.
    
    Ejemplo:
        with get_cursor() as cur:
            cur.execute("SELECT * FROM quotes")
            results = cur.fetchall()
    """
    # Para PostgreSQL, crear nueva conexión en cada operación
    if is_postgres():
        conn = _create_connection()
        cur = conn.cursor()
        try:
            yield cur
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            cur.close()
            conn.close()  # Cerrar conexión después de cada operación
    else:
        # Para SQLite, usar conexión cacheada
        conn = get_connection()
        cur = conn.cursor()
        try:
            yield cur
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            cur.close()
            # NO cerrar conexión SQLite - es cacheada


def init_database():
    """Inicializa las tablas de la base de datos."""
    
    # Para PostgreSQL usamos SERIAL, para SQLite TEXT
    if is_postgres():
        quotes_table = """
        CREATE TABLE IF NOT EXISTS quotes (
            quote_id TEXT PRIMARY KEY,
            quote_group_id TEXT,
            version INTEGER DEFAULT 1,
            parent_quote_id TEXT,
            created_at TIMESTAMP,
            status TEXT,
            total_cost DECIMAL(10,2),
            total_revenue DECIMAL(10,2),
            gross_profit DECIMAL(10,2),
            avg_margin DECIMAL(5,2),
            playbook_name TEXT DEFAULT 'General'
        )
        """
        
        quote_lines_table = """
        CREATE TABLE IF NOT EXISTS quote_lines (
            line_id TEXT PRIMARY KEY,
            quote_id TEXT REFERENCES quotes(quote_id),
            sku TEXT,
            description_original TEXT,
            description_final TEXT,
            description_corrections TEXT,
            line_type TEXT,
            service_origin TEXT,
            cost_unit DECIMAL(10,2),
            final_price_unit DECIMAL(10,2),
            margin_pct DECIMAL(5,2),
            quantity INTEGER DEFAULT 1,
            strategy TEXT,
            warnings TEXT,
            created_at TIMESTAMP,
            import_source TEXT DEFAULT 'manual',
            import_batch_id TEXT
        )
        """
        
        import_files_table = """
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
        """
    else:
        quotes_table = """
        CREATE TABLE IF NOT EXISTS quotes (
            quote_id TEXT PRIMARY KEY,
            quote_group_id TEXT,
            version INTEGER DEFAULT 1,
            parent_quote_id TEXT,
            created_at TEXT,
            status TEXT,
            total_cost REAL,
            total_revenue REAL,
            gross_profit REAL,
            avg_margin REAL,
            playbook_name TEXT DEFAULT 'General'
        )
        """
        
        quote_lines_table = """
        CREATE TABLE IF NOT EXISTS quote_lines (
            line_id TEXT PRIMARY KEY,
            quote_id TEXT,
            sku TEXT,
            description_original TEXT,
            description_final TEXT,
            description_corrections TEXT,
            line_type TEXT,
            service_origin TEXT,
            cost_unit REAL,
            final_price_unit REAL,
            margin_pct REAL,
            quantity INTEGER DEFAULT 1,
            strategy TEXT,
            warnings TEXT,
            created_at TEXT,
            import_source TEXT DEFAULT 'manual',
            import_batch_id TEXT
        )
        """
        
        import_files_table = """
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
        """
    
    try:
        with get_cursor() as cur:
            cur.execute(quotes_table)
            cur.execute(quote_lines_table)
            cur.execute(import_files_table)
        return True, "Base de datos inicializada correctamente"
    except Exception as e:
        return False, f"Error inicializando base de datos: {e}"


def save_import_file(file_id: str, quote_id: str, filename: str, uploaded_at: str, 
                     file_data: bytes, file_size: int, rows_imported: int, rows_errors: int) -> tuple[bool, str]:
    """
    Guarda archivo Excel importado para auditoría.
    
    Args:
        file_id: UUID del archivo
        quote_id: ID de la cotización asociada
        filename: Nombre original del archivo
        uploaded_at: Timestamp de carga
        file_data: Datos binarios del archivo
        file_size: Tamaño en bytes
        rows_imported: Número de filas importadas exitosamente
        rows_errors: Número de filas con errores
    
    Returns:
        Tupla (success: bool, message: str)
    """
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute(
                    """INSERT INTO import_files 
                       (file_id, quote_id, filename, uploaded_at, file_data, file_size, rows_imported, rows_errors)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                    (file_id, quote_id, filename, uploaded_at, file_data, file_size, rows_imported, rows_errors)
                )
            else:
                cur.execute(
                    "INSERT INTO import_files VALUES (?,?,?,?,?,?,?,?)",
                    (file_id, quote_id, filename, uploaded_at, file_data, file_size, rows_imported, rows_errors)
                )
        return True, "✅ Archivo guardado para auditoría"
    except Exception as e:
        return False, f"❌ Error guardando archivo: {e}"


def save_quote(quote_data: tuple, lines_data: list) -> tuple[bool, str]:
    """
    Guarda cotización y sus líneas en una transacción atómica.
    
    Args:
        quote_data: Tupla con datos de la cotización (11 campos: quote_id, quote_group_id, version, parent_quote_id, created_at, status, total_cost, total_revenue, gross_profit, avg_margin, playbook_name)
        lines_data: Lista de tuplas con datos de líneas (17 campos cada una: incluye quantity, import_source, import_batch_id)
    
    Returns:
        Tupla (success: bool, message: str)
    """
    try:
        with get_cursor() as cur:
            # Insertar cotización
            if is_postgres():
                cur.execute(
                    """INSERT INTO quotes 
                       (quote_id, quote_group_id, version, parent_quote_id, created_at, status, total_cost, total_revenue, gross_profit, avg_margin, playbook_name)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    quote_data
                )
                
                # Insertar líneas
                for line in lines_data:
                    cur.execute(
                        """INSERT INTO quote_lines 
                           (line_id, quote_id, sku, description_original, description_final,
                            description_corrections, line_type, service_origin, cost_unit,
                            final_price_unit, margin_pct, quantity, strategy, warnings, created_at,
                            import_source, import_batch_id)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                        line
                    )
            else:
                cur.execute(
                    "INSERT INTO quotes VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    quote_data
                )
                
                for line in lines_data:
                    cur.execute(
                        "INSERT INTO quote_lines VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        line
                    )
        
        return True, "✅ Propuesta guardada correctamente"
    
    except Exception as e:
        error_msg = str(e)
        if "duplicate" in error_msg.lower() or "unique" in error_msg.lower():
            return False, "❌ Error: Ya existe una cotización con este ID"
        return False, f"❌ Error al guardar: {error_msg}"


def get_all_quotes() -> list:
    """Obtiene todas las cotizaciones ordenadas por grupo y versión."""
    try:
        with get_cursor() as cur:
            cur.execute("""
                SELECT quote_id, quote_group_id, version, parent_quote_id, created_at, status, total_cost, total_revenue, gross_profit, avg_margin
                FROM quotes
                ORDER BY quote_group_id, version DESC
            """)
            return cur.fetchall()
    except Exception as e:
        st.error(f"Error obteniendo cotizaciones: {e}")
        return []


def get_quote_lines(quote_id: str) -> list:
    """Obtiene las líneas de una cotización específica."""
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("""
                    SELECT sku, description_final, line_type, service_origin, 
                           cost_unit, final_price_unit, margin_pct, quantity, strategy, warnings
                    FROM quote_lines
                    WHERE quote_id = %s
                """, (quote_id,))
            else:
                cur.execute("""
                    SELECT sku, description_final, line_type, service_origin, 
                           cost_unit, final_price_unit, margin_pct, quantity, strategy, warnings
                    FROM quote_lines
                    WHERE quote_id = ?
                """, (quote_id,))
            return cur.fetchall()
    except Exception as e:
        st.error(f"Error obteniendo líneas: {e}")
        return []


def get_quote_lines_full(quote_id: str) -> list:
    """Obtiene todas las líneas de una cotización con todos los campos."""
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("""
                    SELECT line_id, quote_id, sku, description_original, description_final, 
                           description_corrections, line_type, service_origin, cost_unit, 
                           final_price_unit, margin_pct, quantity, strategy, warnings, created_at
                    FROM quote_lines
                    WHERE quote_id = %s
                """, (quote_id,))
            else:
                cur.execute("""
                    SELECT line_id, quote_id, sku, description_original, description_final, 
                           description_corrections, line_type, service_origin, cost_unit, 
                           final_price_unit, margin_pct, quantity, strategy, warnings, created_at
                    FROM quote_lines
                    WHERE quote_id = ?
                """, (quote_id,))
            return cur.fetchall()
    except Exception as e:
        st.error(f"Error obteniendo líneas completas: {e}")
        return []


def get_latest_version(quote_group_id: str) -> int:
    """Obtiene el número de versión más reciente de un grupo."""
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("""
                    SELECT MAX(version) FROM quotes WHERE quote_group_id = %s
                """, (quote_group_id,))
            else:
                cur.execute("""
                    SELECT MAX(version) FROM quotes WHERE quote_group_id = ?
                """, (quote_group_id,))
            result = cur.fetchone()
            return result[0] if result[0] else 0
    except Exception as e:
        st.error(f"Error obteniendo última versión: {e}")
        return 0


def load_versions_for_group(quote_group_id: str):
    """Carga todas las versiones de una oportunidad."""
    try:
        import pandas as pd
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("""
                    SELECT quote_id, quote_group_id, version, parent_quote_id, created_at, 
                           status, total_cost, total_revenue, gross_profit, avg_margin
                    FROM quotes
                    WHERE quote_group_id = %s
                    ORDER BY version ASC
                """, (quote_group_id,))
            else:
                cur.execute("""
                    SELECT quote_id, quote_group_id, version, parent_quote_id, created_at, 
                           status, total_cost, total_revenue, gross_profit, avg_margin
                    FROM quotes
                    WHERE quote_group_id = ?
                    ORDER BY version ASC
                """, (quote_group_id,))
            
            columns = ["quote_id", "quote_group_id", "version", "parent_quote_id", "created_at",
                      "status", "total_cost", "total_revenue", "gross_profit", "avg_margin"]
            return pd.DataFrame(cur.fetchall(), columns=columns)
    except Exception as e:
        st.error(f"Error cargando versiones: {e}")
        return pd.DataFrame()


def load_lines_for_quote(quote_id: str):
    """Carga todas las líneas de una cotización para comparación."""
    try:
        import pandas as pd
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("""
                    SELECT line_id, quote_id, sku, description_original, description_final,
                           description_corrections, line_type, service_origin, cost_unit,
                           final_price_unit, margin_pct, quantity, strategy, warnings, created_at,
                           import_source, import_batch_id
                    FROM quote_lines
                    WHERE quote_id = %s
                """, (quote_id,))
            else:
                cur.execute("""
                    SELECT line_id, quote_id, sku, description_original, description_final,
                           description_corrections, line_type, service_origin, cost_unit,
                           final_price_unit, margin_pct, quantity, strategy, warnings, created_at,
                           import_source, import_batch_id
                    FROM quote_lines
                    WHERE quote_id = ?
                """, (quote_id,))
            
            columns = ["line_id", "quote_id", "sku", "description_original", "description_final",
                      "description_corrections", "line_type", "service_origin", "cost_unit",
                      "final_price_unit", "margin_pct", "quantity", "strategy", "warnings", "created_at",
                      "import_source", "import_batch_id"]
            return pd.DataFrame(cur.fetchall(), columns=columns)
    except Exception as e:
        st.error(f"Error cargando líneas: {e}")
        return pd.DataFrame()


def get_database_info() -> dict:
    """Retorna información sobre la base de datos en uso."""
    if is_postgres():
        try:
            with get_cursor() as cur:
                cur.execute("SELECT version()")
                version = cur.fetchone()[0]
            return {
                "type": "PostgreSQL (Neon)",
                "version": version,
                "connection": "Cloud",
                "icon": "☁️",
                "host": DATABASE_URL.split("@")[1].split("/")[0] if "@" in DATABASE_URL else "Unknown"
            }
        except:
            return {
                "type": "PostgreSQL (Neon)",
                "version": "Unknown",
                "connection": "Cloud",
                "icon": "☁️",
                "host": "Unknown"
            }
    else:
        return {
            "type": "SQLite",
            "version": sqlite3.sqlite_version,
            "connection": "Local",
            "icon": "💾",
            "host": "Local"
        }
