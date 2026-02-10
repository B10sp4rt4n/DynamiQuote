"""
Módulo de gestión de base de datos para DynamiQuote.
Soporta tanto PostgreSQL (Neon) como SQLite para desarrollo local.
"""

import os
import sqlite3
from contextlib import contextmanager
from typing import Optional, Generator
from datetime import datetime, UTC
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
        # Verificar si estamos en Streamlit y si secrets está disponible
        if hasattr(st, 'secrets'):
            print("🔍 DEBUG: st.secrets está disponible")
            secrets_keys = list(st.secrets.keys()) if hasattr(st.secrets, 'keys') else []
            print(f"🔍 DEBUG: Keys en secrets: {secrets_keys}")
            
            if 'DATABASE_URL' in st.secrets:
                db_url = st.secrets['DATABASE_URL']
                print(f"✅ Usando DATABASE_URL de Streamlit Cloud Secrets")
                print(f"🔍 DEBUG: URL encontrada (primeros 30 chars): {db_url[:30]}...")
                return db_url
            else:
                print("⚠️ WARNING: DATABASE_URL no encontrada en st.secrets")
        else:
            print("⚠️ WARNING: st.secrets no está disponible")
    except Exception as e:
        print(f"❌ ERROR al leer st.secrets: {e}")
    
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

        proposals_table = """
        CREATE TABLE IF NOT EXISTS proposals (
            proposal_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            origin TEXT,
            status TEXT NOT NULL,
            created_by TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL,
            closed_at TIMESTAMP
        )
        """

        proposal_items_table = """
        CREATE TABLE IF NOT EXISTS proposal_items (
            item_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            proposal_id TEXT NOT NULL REFERENCES proposals(proposal_id),
            item_number INTEGER NOT NULL,
            quantity NUMERIC NOT NULL,
            sku TEXT,
            description TEXT,
            cost_unit NUMERIC NOT NULL,
            price_unit NUMERIC,
            subtotal_cost NUMERIC NOT NULL,
            subtotal_price NUMERIC,
            status TEXT NOT NULL,
            origin TEXT,
            component_type TEXT,
            created_at TIMESTAMP NOT NULL,
            updated_at TIMESTAMP
        )
        """

        proposal_integrated_node_table = """
        CREATE TABLE IF NOT EXISTS proposal_integrated_node (
            proposal_id TEXT PRIMARY KEY REFERENCES proposals(proposal_id),
            tenant_id TEXT NOT NULL,
            total_cost NUMERIC,
            total_price NUMERIC,
            gross_profit NUMERIC,
            margin_pct NUMERIC,
            health TEXT,
            status TEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL
        )
        """

        proposal_profitability_node_table = """
        CREATE TABLE IF NOT EXISTS proposal_profitability_node (
            proposal_id TEXT PRIMARY KEY REFERENCES proposals(proposal_id),
            tenant_id TEXT NOT NULL,
            total_sales NUMERIC,
            total_cost NUMERIC,
            total_expenses NUMERIC,
            net_profit NUMERIC,
            net_margin_pct NUMERIC,
            health TEXT,
            updated_at TIMESTAMP NOT NULL
        )
        """

        proposal_derivations_table = """
        CREATE TABLE IF NOT EXISTS proposal_derivations (
            base_proposal_id TEXT NOT NULL REFERENCES proposals(proposal_id),
            derived_proposal_id TEXT NOT NULL REFERENCES proposals(proposal_id),
            tenant_id TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL
        )
        """

        project_expenses_table = """
        CREATE TABLE IF NOT EXISTS project_expenses (
            expense_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            proposal_id TEXT NOT NULL REFERENCES proposals(proposal_id),
            category TEXT NOT NULL,
            description TEXT,
            amount NUMERIC NOT NULL,
            created_at TIMESTAMP NOT NULL
        )
        """

        proposal_audit_events_table = """
        CREATE TABLE IF NOT EXISTS proposal_audit_events (
            event_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            proposal_id TEXT NOT NULL REFERENCES proposals(proposal_id),
            event_type TEXT NOT NULL,
            event_hash TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL,
            payload TEXT
        )
        """

        # Tablas para propuestas formales
        company_logos_table = """
        CREATE TABLE IF NOT EXISTS company_logos (
            logo_id TEXT PRIMARY KEY,
            logo_name TEXT NOT NULL,
            logo_type TEXT NOT NULL,
            company_name TEXT,
            logo_data BYTEA NOT NULL,
            logo_format TEXT NOT NULL,
            uploaded_at TIMESTAMP NOT NULL,
            is_default BOOLEAN DEFAULT FALSE
        )
        """

        formal_proposals_table = """
        CREATE TABLE IF NOT EXISTS formal_proposals (
            proposal_doc_id TEXT PRIMARY KEY,
            quote_id TEXT REFERENCES quotes(quote_id),
            proposal_id TEXT REFERENCES proposals(proposal_id),
            
            proposal_number TEXT UNIQUE NOT NULL,
            issued_date DATE NOT NULL,
            valid_until DATE,
            
            issuer_company TEXT NOT NULL,
            issuer_contact_name TEXT,
            issuer_contact_title TEXT,
            issuer_email TEXT,
            issuer_phone TEXT,
            
            recipient_company TEXT NOT NULL,
            recipient_contact_name TEXT,
            recipient_contact_title TEXT,
            recipient_email TEXT,
            
            client_type TEXT,
            market_sector TEXT,
            subject TEXT,
            custom_intro TEXT,
            
            issuer_logo_id TEXT REFERENCES company_logos(logo_id),
            client_logo_id TEXT REFERENCES company_logos(logo_id),
            
            terms_and_conditions TEXT,
            
            signature_name TEXT,
            signature_title TEXT,
            signature_image_data BYTEA,
            
            iva_rate NUMERIC DEFAULT 0.16,
            iva_included BOOLEAN DEFAULT FALSE,
            
            total_pages INTEGER,
            pdf_file_data BYTEA,
            
            status TEXT DEFAULT 'draft',
            sent_at TIMESTAMP,
            
            created_by TEXT,
            created_at TIMESTAMP NOT NULL,
            updated_at TIMESTAMP
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

        proposals_table = """
        CREATE TABLE IF NOT EXISTS proposals (
            proposal_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            origin TEXT,
            status TEXT NOT NULL,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL,
            closed_at TEXT
        )
        """

        proposal_items_table = """
        CREATE TABLE IF NOT EXISTS proposal_items (
            item_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            proposal_id TEXT NOT NULL,
            item_number INTEGER NOT NULL,
            quantity REAL NOT NULL,
            sku TEXT,
            description TEXT,
            cost_unit REAL NOT NULL,
            price_unit REAL,
            subtotal_cost REAL NOT NULL,
            subtotal_price REAL,
            status TEXT NOT NULL,
            origin TEXT,
            component_type TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            FOREIGN KEY (proposal_id) REFERENCES proposals(proposal_id)
        )
        """

        proposal_integrated_node_table = """
        CREATE TABLE IF NOT EXISTS proposal_integrated_node (
            proposal_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            total_cost REAL,
            total_price REAL,
            gross_profit REAL,
            margin_pct REAL,
            health TEXT,
            status TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (proposal_id) REFERENCES proposals(proposal_id)
        )
        """

        proposal_profitability_node_table = """
        CREATE TABLE IF NOT EXISTS proposal_profitability_node (
            proposal_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            total_sales REAL,
            total_cost REAL,
            total_expenses REAL,
            net_profit REAL,
            net_margin_pct REAL,
            health TEXT,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (proposal_id) REFERENCES proposals(proposal_id)
        )
        """

        proposal_derivations_table = """
        CREATE TABLE IF NOT EXISTS proposal_derivations (
            base_proposal_id TEXT NOT NULL,
            derived_proposal_id TEXT NOT NULL,
            tenant_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (base_proposal_id) REFERENCES proposals(proposal_id),
            FOREIGN KEY (derived_proposal_id) REFERENCES proposals(proposal_id)
        )
        """

        project_expenses_table = """
        CREATE TABLE IF NOT EXISTS project_expenses (
            expense_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            proposal_id TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT,
            amount REAL NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (proposal_id) REFERENCES proposals(proposal_id)
        )
        """

        proposal_audit_events_table = """
        CREATE TABLE IF NOT EXISTS proposal_audit_events (
            event_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            proposal_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            event_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            payload TEXT,
            FOREIGN KEY (proposal_id) REFERENCES proposals(proposal_id)
        )
        """

        # Tablas para propuestas formales
        company_logos_table = """
        CREATE TABLE IF NOT EXISTS company_logos (
            logo_id TEXT PRIMARY KEY,
            logo_name TEXT NOT NULL,
            logo_type TEXT NOT NULL,
            company_name TEXT,
            logo_data BLOB NOT NULL,
            logo_format TEXT NOT NULL,
            uploaded_at TEXT NOT NULL,
            is_default INTEGER DEFAULT 0
        )
        """

        formal_proposals_table = """
        CREATE TABLE IF NOT EXISTS formal_proposals (
            proposal_doc_id TEXT PRIMARY KEY,
            quote_id TEXT,
            proposal_id TEXT,
            
            proposal_number TEXT UNIQUE NOT NULL,
            issued_date TEXT NOT NULL,
            valid_until TEXT,
            
            issuer_company TEXT NOT NULL,
            issuer_contact_name TEXT,
            issuer_contact_title TEXT,
            issuer_email TEXT,
            issuer_phone TEXT,
            
            recipient_company TEXT NOT NULL,
            recipient_contact_name TEXT,
            recipient_contact_title TEXT,
            recipient_email TEXT,
            
            client_type TEXT,
            market_sector TEXT,
            subject TEXT,
            custom_intro TEXT,
            
            issuer_logo_id TEXT,
            client_logo_id TEXT,
            
            terms_and_conditions TEXT,
            
            signature_name TEXT,
            signature_title TEXT,
            signature_image_data BLOB,
            
            iva_rate REAL DEFAULT 0.16,
            iva_included INTEGER DEFAULT 0,
            
            total_pages INTEGER,
            pdf_file_data BLOB,
            
            status TEXT DEFAULT 'draft',
            sent_at TEXT,
            
            created_by TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            
            FOREIGN KEY (quote_id) REFERENCES quotes(quote_id),
            FOREIGN KEY (proposal_id) REFERENCES proposals(proposal_id),
            FOREIGN KEY (issuer_logo_id) REFERENCES company_logos(logo_id),
            FOREIGN KEY (client_logo_id) REFERENCES company_logos(logo_id)
        )
        """
    
    try:
        with get_cursor() as cur:
            cur.execute(quotes_table)
            cur.execute(quote_lines_table)
            cur.execute(import_files_table)
            cur.execute(proposals_table)
            cur.execute(proposal_items_table)
            cur.execute(proposal_integrated_node_table)
            cur.execute(proposal_profitability_node_table)
            cur.execute(proposal_derivations_table)
            cur.execute(project_expenses_table)
            cur.execute(proposal_audit_events_table)
            cur.execute(company_logos_table)
            cur.execute(formal_proposals_table)
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
        quote_data: Tupla con datos de la cotización (14 campos: quote_id, quote_group_id, version, parent_quote_id, created_at, status, total_cost, total_revenue, gross_profit, avg_margin, playbook_name, client_name, quoted_by, proposal_name)
        lines_data: Lista de tuplas con datos de líneas (17 campos cada una: incluye import_source, import_batch_id)
    
    Returns:
        Tupla (success: bool, message: str)
    """
    print(f"[DEBUG] save_quote: Recibidas {len(lines_data)} líneas para guardar")
    
    if not lines_data:
        return False, "❌ Error: No hay líneas para guardar"
    
    try:
        with get_cursor() as cur:
            # Insertar cotización
            if is_postgres():
                print(f"[DEBUG] Guardando cotización en PostgreSQL: {quote_data[0]}")
                cur.execute(
                    """INSERT INTO quotes 
                       (quote_id, quote_group_id, version, parent_quote_id, created_at, status, total_cost, total_revenue, gross_profit, avg_margin, playbook_name, client_name, quoted_by, proposal_name)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    quote_data
                )
                print(f"[DEBUG] Cotización guardada, insertando líneas...")
                
                # Insertar líneas
                lines_saved = 0
                for idx, line in enumerate(lines_data):
                    try:
                        print(f"[DEBUG] Guardando línea {idx+1}/{len(lines_data)}: {line[2]}")
                        cur.execute(
                            """INSERT INTO quote_lines 
                               (line_id, quote_id, sku, quantity, description_original, description_final,
                                description_corrections, line_type, service_origin, cost_unit,
                                final_price_unit, margin_pct, strategy, warnings, created_at,
                                import_source, import_batch_id)
                               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                            line
                        )
                        lines_saved += 1
                    except Exception as line_error:
                        print(f"[ERROR] Error guardando línea {idx+1}: {line_error}")
                        print(f"[ERROR] Datos de la línea: {line}")
                        raise
                print(f"[DEBUG] save_quote: Se guardaron {lines_saved} líneas en PostgreSQL")
            else:
                print(f"[DEBUG] Guardando cotización en SQLite: {quote_data[0]}")
                cur.execute(
                    "INSERT INTO quotes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    quote_data
                )
                print(f"[DEBUG] Cotización guardada, insertando líneas...")
                
                lines_saved = 0
                for idx, line in enumerate(lines_data):
                    try:
                        print(f"[DEBUG] Guardando línea {idx+1}/{len(lines_data)}: {line[2]}")
                        cur.execute(
                            "INSERT INTO quote_lines VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                            line
                        )
                        lines_saved += 1
                    except Exception as line_error:
                        print(f"[ERROR] Error guardando línea {idx+1}: {line_error}")
                        print(f"[ERROR] Datos de la línea: {line}")
                        raise
                print(f"[DEBUG] save_quote: Se guardaron {lines_saved} líneas en SQLite")
        
        print(f"[DEBUG] ✅ Transacción completada exitosamente")
        return True, f"✅ Propuesta guardada correctamente con {lines_saved} línea(s)"
    
    except Exception as e:
        error_msg = str(e)
        print(f"[ERROR] save_quote falló: {error_msg}")
        if "duplicate" in error_msg.lower() or "unique" in error_msg.lower():
            return False, "❌ Error: Ya existe una cotización con este ID"
        return False, f"❌ Error al guardar: {error_msg}"


@st.cache_data(ttl=30)  # Cache por 30 segundos
def get_all_quotes() -> list:
    """Obtiene todas las cotizaciones ordenadas por grupo y versión."""
    try:
        with get_cursor() as cur:
            cur.execute("""
                SELECT quote_id, quote_group_id, version, parent_quote_id, created_at, status, total_cost, total_revenue, gross_profit, avg_margin, playbook_name, client_name, quoted_by, proposal_name
                FROM quotes
                ORDER BY quote_group_id, version DESC
            """)
            return cur.fetchall()
    except Exception as e:
        st.error(f"Error obteniendo cotizaciones: {e}")
        return []


@st.cache_data(ttl=60)  # Cache por 1 minuto
def get_quote_lines(quote_id: str) -> list:
    """Obtiene las líneas de una cotización específica."""
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("""
                    SELECT sku, description_final, line_type, service_origin, 
                           cost_unit, final_price_unit, margin_pct, strategy, warnings
                    FROM quote_lines
                    WHERE quote_id = %s
                """, (quote_id,))
            else:
                cur.execute("""
                    SELECT sku, description_final, line_type, service_origin, 
                           cost_unit, final_price_unit, margin_pct, strategy, warnings
                    FROM quote_lines
                    WHERE quote_id = ?
                """, (quote_id,))
            return cur.fetchall()
    except Exception as e:
        st.error(f"Error obteniendo líneas: {e}")
        return []


@st.cache_data(ttl=60)  # Cache por 1 minuto
def get_quote_lines_full(quote_id: str) -> list:
    """Obtiene todas las líneas de una cotización con todos los campos."""
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("""
                    SELECT line_id, quote_id, sku, quantity, description_original, description_final, 
                           description_corrections, line_type, service_origin, cost_unit, 
                           final_price_unit, margin_pct, strategy, warnings, created_at,
                           import_source, import_batch_id
                    FROM quote_lines
                    WHERE quote_id = %s
                """, (quote_id,))
            else:
                cur.execute("""
                    SELECT line_id, quote_id, sku, quantity, description_original, description_final, 
                           description_corrections, line_type, service_origin, cost_unit, 
                           final_price_unit, margin_pct, strategy, warnings, created_at,
                           import_source, import_batch_id
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


@st.cache_data(ttl=60)  # Cache por 1 minuto
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


@st.cache_data(ttl=60)  # Cache por 1 minuto  
def load_lines_for_quote(quote_id: str):
    """Carga todas las líneas de una cotización para comparación."""
    try:
        import pandas as pd
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("""
                    SELECT line_id, quote_id, sku, description_original, description_final,
                           description_corrections, line_type, service_origin, cost_unit,
                           final_price_unit, margin_pct, strategy, warnings, created_at,
                           import_source, import_batch_id
                    FROM quote_lines
                    WHERE quote_id = %s
                """, (quote_id,))
            else:
                cur.execute("""
                    SELECT line_id, quote_id, sku, description_original, description_final,
                           description_corrections, line_type, service_origin, cost_unit,
                           final_price_unit, margin_pct, strategy, warnings, created_at,
                           import_source, import_batch_id
                    FROM quote_lines
                    WHERE quote_id = ?
                """, (quote_id,))
            
            columns = ["line_id", "quote_id", "sku", "description_original", "description_final",
                      "description_corrections", "line_type", "service_origin", "cost_unit",
                      "final_price_unit", "margin_pct", "strategy", "warnings", "created_at",
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


# ====================================
# Funciones para Propuestas Formales
# ====================================

def save_logo(logo_id: str, logo_name: str, logo_type: str, company_name: str,
              logo_data: bytes, logo_format: str, is_default: bool = False) -> tuple[bool, str]:
    """
    Guarda un logo en la base de datos.
    
    Args:
        logo_id: UUID del logo
        logo_name: Nombre descriptivo del logo
        logo_type: Tipo de logo ('issuer' o 'client')
        company_name: Nombre de la empresa
        logo_data: Datos binarios del logo
        logo_format: Formato del archivo (png, jpg, svg)
        is_default: Si es el logo por defecto
        
    Returns:
        Tupla (success: bool, message: str)
    """
    try:
        uploaded_at = datetime.now(UTC).isoformat()
        with get_cursor() as cur:
            if is_postgres():
                cur.execute(
                    """INSERT INTO company_logos 
                       (logo_id, logo_name, logo_type, company_name, logo_data, logo_format, uploaded_at, is_default)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                    (logo_id, logo_name, logo_type, company_name, logo_data, logo_format, uploaded_at, is_default)
                )
            else:
                cur.execute(
                    """INSERT INTO company_logos 
                       (logo_id, logo_name, logo_type, company_name, logo_data, logo_format, uploaded_at, is_default)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (logo_id, logo_name, logo_type, company_name, logo_data, logo_format, uploaded_at, 1 if is_default else 0)
                )
        return True, "✅ Logo guardado exitosamente"
    except Exception as e:
        return False, f"❌ Error guardando logo: {e}"


def get_logos(logo_type: str = None) -> list:
    """
    Obtiene lista de logos disponibles.
    
    Args:
        logo_type: Filtrar por tipo ('issuer' o 'client'). None para todos.
        
    Returns:
        Lista de diccionarios con información de logos
    """
    try:
        with get_cursor() as cur:
            if logo_type:
                if is_postgres():
                    cur.execute(
                        "SELECT logo_id, logo_name, logo_type, company_name, logo_format, uploaded_at, is_default FROM company_logos WHERE logo_type = %s ORDER BY uploaded_at DESC",
                        (logo_type,)
                    )
                else:
                    cur.execute(
                        "SELECT logo_id, logo_name, logo_type, company_name, logo_format, uploaded_at, is_default FROM company_logos WHERE logo_type = ? ORDER BY uploaded_at DESC",
                        (logo_type,)
                    )
            else:
                cur.execute(
                    "SELECT logo_id, logo_name, logo_type, company_name, logo_format, uploaded_at, is_default FROM company_logos ORDER BY uploaded_at DESC"
                )
            
            columns = ["logo_id", "logo_name", "logo_type", "company_name", "logo_format", "uploaded_at", "is_default"]
            results = []
            for row in cur.fetchall():
                results.append(dict(zip(columns, row)))
            return results
    except Exception as e:
        st.error(f"Error obteniendo logos: {e}")
        return []


def get_logo_data(logo_id: str) -> tuple[bool, bytes, str]:
    """
    Obtiene datos binarios de un logo.
    
    Args:
        logo_id: ID del logo
        
    Returns:
        Tupla (success: bool, logo_data: bytes, logo_format: str)
    """
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("SELECT logo_data, logo_format FROM company_logos WHERE logo_id = %s", (logo_id,))
            else:
                cur.execute("SELECT logo_data, logo_format FROM company_logos WHERE logo_id = ?", (logo_id,))
            
            result = cur.fetchone()
            if result:
                return True, result[0], result[1]
            return False, b"", ""
    except Exception as e:
        st.error(f"Error obteniendo logo: {e}")
        return False, b"", ""


def save_formal_proposal(proposal_data: dict) -> tuple[bool, str]:
    """
    Guarda una propuesta formal en la base de datos.
    
    Args:
        proposal_data: Diccionario con todos los campos de la propuesta
        
    Returns:
        Tupla (success: bool, message: str)
    """
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute(
                    """INSERT INTO formal_proposals 
                       (proposal_doc_id, quote_id, proposal_id, proposal_number, issued_date, valid_until,
                        issuer_company, issuer_contact_name, issuer_contact_title, issuer_email, issuer_phone,
                        recipient_company, recipient_contact_name, recipient_contact_title, recipient_email,
                        client_type, market_sector, subject, custom_intro,
                        issuer_logo_id, client_logo_id, terms_and_conditions,
                        signature_name, signature_title, signature_image_data,
                        iva_rate, iva_included, total_pages, pdf_file_data,
                        status, created_by, created_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (
                        proposal_data['proposal_doc_id'], proposal_data.get('quote_id'), proposal_data.get('proposal_id'),
                        proposal_data['proposal_number'], proposal_data['issued_date'], proposal_data.get('valid_until'),
                        proposal_data['issuer_company'], proposal_data.get('issuer_contact_name'), proposal_data.get('issuer_contact_title'),
                        proposal_data.get('issuer_email'), proposal_data.get('issuer_phone'),
                        proposal_data['recipient_company'], proposal_data.get('recipient_contact_name'),
                        proposal_data.get('recipient_contact_title'), proposal_data.get('recipient_email'),
                        proposal_data.get('client_type'), proposal_data.get('market_sector'), proposal_data.get('subject'),
                        proposal_data.get('custom_intro'), proposal_data.get('issuer_logo_id'), proposal_data.get('client_logo_id'),
                        proposal_data.get('terms_and_conditions'), proposal_data.get('signature_name'),
                        proposal_data.get('signature_title'), proposal_data.get('signature_image_data'),
                        proposal_data.get('iva_rate', 0.16), proposal_data.get('iva_included', False),
                        proposal_data.get('total_pages'), proposal_data.get('pdf_file_data'),
                        proposal_data.get('status', 'draft'), proposal_data.get('created_by'), proposal_data['created_at']
                    )
                )
            else:
                cur.execute(
                    """INSERT INTO formal_proposals 
                       (proposal_doc_id, quote_id, proposal_id, proposal_number, issued_date, valid_until,
                        issuer_company, issuer_contact_name, issuer_contact_title, issuer_email, issuer_phone,
                        recipient_company, recipient_contact_name, recipient_contact_title, recipient_email,
                        client_type, market_sector, subject, custom_intro,
                        issuer_logo_id, client_logo_id, terms_and_conditions,
                        signature_name, signature_title, signature_image_data,
                        iva_rate, iva_included, total_pages, pdf_file_data,
                        status, created_by, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        proposal_data['proposal_doc_id'], proposal_data.get('quote_id'), proposal_data.get('proposal_id'),
                        proposal_data['proposal_number'], proposal_data['issued_date'], proposal_data.get('valid_until'),
                        proposal_data['issuer_company'], proposal_data.get('issuer_contact_name'), proposal_data.get('issuer_contact_title'),
                        proposal_data.get('issuer_email'), proposal_data.get('issuer_phone'),
                        proposal_data['recipient_company'], proposal_data.get('recipient_contact_name'),
                        proposal_data.get('recipient_contact_title'), proposal_data.get('recipient_email'),
                        proposal_data.get('client_type'), proposal_data.get('market_sector'), proposal_data.get('subject'),
                        proposal_data.get('custom_intro'), proposal_data.get('issuer_logo_id'), proposal_data.get('client_logo_id'),
                        proposal_data.get('terms_and_conditions'), proposal_data.get('signature_name'),
                        proposal_data.get('signature_title'), proposal_data.get('signature_image_data'),
                        proposal_data.get('iva_rate', 0.16), 1 if proposal_data.get('iva_included', False) else 0,
                        proposal_data.get('total_pages'), proposal_data.get('pdf_file_data'),
                        proposal_data.get('status', 'draft'), proposal_data.get('created_by'), proposal_data['created_at']
                    )
                )
        return True, f"✅ Propuesta {proposal_data['proposal_number']} guardada exitosamente"
    except Exception as e:
        return False, f"❌ Error guardando propuesta: {e}"


def get_formal_proposals(quote_id: str = None, status_filter: str = None) -> list:
    """
    Obtiene lista de propuestas formales.
    
    Args:
        quote_id: Filtrar por cotización. None para todas.
        status_filter: Filtrar por estado ('draft', 'delivered'). None para todos.
        
    Returns:
        Lista de diccionarios con propuestas
    """
    try:
        with get_cursor() as cur:
            # Construir query con filtros
            base_query = """
                SELECT proposal_doc_id, quote_id, proposal_number, issued_date, 
                       recipient_company, status, created_at, delivery_number,
                       delivery_hash, delivered_at, delivered_by
                FROM formal_proposals 
            """
            
            conditions = []
            params = []
            
            if quote_id:
                conditions.append("quote_id = %s" if is_postgres() else "quote_id = ?")
                params.append(quote_id)
            
            if status_filter:
                conditions.append("status = %s" if is_postgres() else "status = ?")
                params.append(status_filter)
            
            if conditions:
                base_query += " WHERE " + " AND ".join(conditions)
            
            base_query += " ORDER BY created_at DESC"
            
            cur.execute(base_query, tuple(params) if params else ())
            
            columns = ["proposal_doc_id", "quote_id", "proposal_number", "issued_date", 
                      "recipient_company", "status", "created_at", "delivery_number",
                      "delivery_hash", "delivered_at", "delivered_by"]
            results = []
            for row in cur.fetchall():
                results.append(dict(zip(columns, row)))
            return results
    except Exception as e:
        st.error(f"Error obteniendo propuestas formales: {e}")
        return []


def get_formal_proposal(proposal_doc_id: str) -> dict:
    """
    Obtiene una propuesta formal completa.
    
    Args:
        proposal_doc_id: ID de la propuesta
        
    Returns:
        Diccionario con todos los datos de la propuesta
    """
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("SELECT * FROM formal_proposals WHERE proposal_doc_id = %s", (proposal_doc_id,))
            else:
                cur.execute("SELECT * FROM formal_proposals WHERE proposal_doc_id = ?", (proposal_doc_id,))
            
            row = cur.fetchone()
            if row:
                columns = [desc[0] for desc in cur.description]
                return dict(zip(columns, row))
            return {}
    except Exception as e:
        st.error(f"Error obteniendo propuesta: {e}")
        return {}


def generate_delivery_number() -> str:
    """
    Genera el próximo número consecutivo de entrega.
    Formato: ENTREGA-YYYY-NNNN (ej: ENTREGA-2026-0001)
    
    Returns:
        Número de entrega único
    """
    from datetime import datetime, UTC
    try:
        with get_cursor() as cur:
            year = datetime.now(UTC).year
            
            if is_postgres():
                cur.execute("""
                    SELECT delivery_number FROM formal_proposals 
                    WHERE delivery_number LIKE %s 
                    ORDER BY delivery_number DESC LIMIT 1
                """, (f"ENTREGA-{year}-%",))
            else:
                cur.execute("""
                    SELECT delivery_number FROM formal_proposals 
                    WHERE delivery_number LIKE ? 
                    ORDER BY delivery_number DESC LIMIT 1
                """, (f"ENTREGA-{year}-%",))
            
            result = cur.fetchone()
            if result and result[0]:
                # Extraer el número secuencial del último
                last_number = int(result[0].split('-')[-1])
                next_number = last_number + 1
            else:
                next_number = 1
            
            return f"ENTREGA-{year}-{next_number:04d}"
    except Exception as e:
        print(f"Error generando delivery_number: {e}")
        from datetime import datetime, UTC
        import uuid
        # Fallback: usar timestamp
        return f"ENTREGA-{datetime.now(UTC).year}-{str(uuid.uuid4())[:4].upper()}"


def generate_delivery_hash(proposal_doc_id: str) -> str:
    """
    Genera un hash único e inmutable para una propuesta entregada.
    
    Args:
        proposal_doc_id: ID de la propuesta
        
    Returns:
        Hash SHA256 de 16 caracteres
    """
    import hashlib
    from datetime import datetime, UTC
    
    # Combinar proposal_doc_id + timestamp + salt
    timestamp = datetime.now(UTC).isoformat()
    salt = "DynamiQuote-Delivery-2026"
    data = f"{proposal_doc_id}{timestamp}{salt}"
    
    hash_obj = hashlib.sha256(data.encode('utf-8'))
    return hash_obj.hexdigest()[:16].upper()


def mark_proposal_as_delivered(proposal_doc_id: str, delivered_by: str) -> tuple[bool, str]:
    """
    Marca una propuesta como entregada.
    Genera delivery_number, delivery_hash, y marca delivered_at.
    El estado se vuelve inmutable.
    
    Args:
        proposal_doc_id: ID de la propuesta
        delivered_by: Usuario que marca como entregada
        
    Returns:
        Tupla (success: bool, message: str)
    """
    from datetime import datetime, UTC
    
    try:
        with get_cursor() as cur:
            # Verificar que la propuesta existe y es draft
            if is_postgres():
                cur.execute("""
                    SELECT status, delivery_hash FROM formal_proposals 
                    WHERE proposal_doc_id = %s
                """, (proposal_doc_id,))
            else:
                cur.execute("""
                    SELECT status, delivery_hash FROM formal_proposals 
                    WHERE proposal_doc_id = ?
                """, (proposal_doc_id,))
            
            result = cur.fetchone()
            if not result:
                return False, "❌ Propuesta no encontrada"
            
            current_status, existing_hash = result
            
            if existing_hash:
                return False, "❌ Esta propuesta ya fue entregada y es inmutable"
            
            # Generar datos de entrega
            delivery_number = generate_delivery_number()
            delivery_hash = generate_delivery_hash(proposal_doc_id)
            delivered_at = datetime.now(UTC).isoformat()
            
            # Actualizar propuesta
            if is_postgres():
                cur.execute("""
                    UPDATE formal_proposals 
                    SET status = 'delivered',
                        delivery_number = %s,
                        delivery_hash = %s,
                        delivered_at = %s,
                        delivered_by = %s,
                        updated_at = %s
                    WHERE proposal_doc_id = %s
                """, (delivery_number, delivery_hash, delivered_at, delivered_by, delivered_at, proposal_doc_id))
            else:
                cur.execute("""
                    UPDATE formal_proposals 
                    SET status = 'delivered',
                        delivery_number = ?,
                        delivery_hash = ?,
                        delivered_at = ?,
                        delivered_by = ?,
                        updated_at = ?
                    WHERE proposal_doc_id = ?
                """, (delivery_number, delivery_hash, delivered_at, delivered_by, delivered_at, proposal_doc_id))
            
            return True, f"✅ Propuesta marcada como entregada: {delivery_number}"
            
    except Exception as e:
        return False, f"❌ Error marcando como entregada: {e}"


def run_migrations():
    """
    Ejecuta todas las migraciones de base de datos necesarias.
    Esta función se llama automáticamente al iniciar la aplicación.
    
    Returns:
        tuple: (success: bool, message: str)
    """
    print("🔄 Ejecutando migraciones de base de datos...")
    
    migration_results = []
    
    try:
        # Importar y ejecutar cada migración
        migrations = [
            ("client_name", "migrate_add_client_name"),
            ("quoted_by_and_proposal_name", "migrate_add_quoted_by_and_proposal_name"),
            ("quantity", "migrate_add_quantity_to_quote_lines"),
            ("formal_proposals", "migrate_add_formal_proposals"),
            ("delivery_hash", "migrate_add_delivery_hash"),
        ]
        
        for name, module_name in migrations:
            try:
                print(f"  📦 Ejecutando migración: {name}")
                module = __import__(module_name)
                if hasattr(module, 'migrate'):
                    success = module.migrate()
                    if success:
                        migration_results.append(f"✅ {name}")
                    else:
                        migration_results.append(f"⚠️ {name} (falló)")
                else:
                    migration_results.append(f"⚠️ {name} (sin función migrate)")
            except Exception as e:
                print(f"  ⚠️ Error en migración {name}: {e}")
                migration_results.append(f"⚠️ {name} (error: {str(e)[:50]})")
        
        print("✅ Proceso de migraciones completado")
        summary = "\n".join(migration_results)
        return True, f"Migraciones ejecutadas:\n{summary}"
        
    except Exception as e:
        error_msg = f"Error ejecutando migraciones: {e}"
        print(f"❌ {error_msg}")
        return False, error_msg

