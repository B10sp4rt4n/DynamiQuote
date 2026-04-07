"""
Módulo de gestión de base de datos para DynamiQuote.
Soporta tanto PostgreSQL (Neon) como SQLite para desarrollo local.

ARQUITECTURA DE CONSULTAS (Sin Caché):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
La BD se consulta BAJO DEMANDA - Sin mantener datos en memoria.

✅ CONSULTAS PRINCIPALES:
  - search_quotes(query, limit)      → Búsquedas filtradas (default: 20)
  - get_recent_quotes(limit)         → Últimas cotizaciones (default: 20)
  - get_quote_groups_summary(limit)  → Resumen grupos (default: 100)
  - get_quote_lines(quote_id)        → Líneas de una cotización específica
  - load_lines_for_quote(quote_id)   → DataFrame para comparación

✅ EXPORTACIÓN COMPLETA:
  - get_all_quotes()                 → Solo para exportar BD completa
  
✅ RECURSOS CACHEADOS:
  - get_connection()                 → Conexión singleton (@st.cache_resource)
  
❌ NO usar @st.cache_data en consultas: Acumula datos en memoria innecesariamente.

REGLA: La BD es fuente de verdad. Consultar cuando se necesite, no precachear.
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

def is_streamlit_cloud() -> bool:
    """Detecta si la app corre en Streamlit Cloud."""
    return os.getenv('STREAMLIT_SHARING_MODE', '') == 'streamlit_app'


def get_config_value(key: str) -> tuple[Optional[str], str]:
    """
    Obtiene una configuración desde Streamlit Secrets, .env o variables de entorno.

    Retorna:
        tuple[value, source]
        source puede ser: streamlit-secrets, streamlit-secrets:<section>, dotenv, env, missing
    """
    try:
        if hasattr(st, 'secrets'):
            if key in st.secrets:
                value = st.secrets[key]
                if value and str(value).strip():
                    return str(value).strip(), 'streamlit-secrets'

            for section in ('database', 'openai', 'connections', 'app', 'secrets'):
                if section in st.secrets:
                    section_values = st.secrets[section]
                    if hasattr(section_values, 'get'):
                        value = section_values.get(key)
                        if value and str(value).strip():
                            return str(value).strip(), f'streamlit-secrets:{section}'
    except Exception as e:
        print(f"❌ ERROR al leer st.secrets para {key}: {e}")

    load_dotenv()
    value = os.getenv(key)
    if value and value.strip():
        return value.strip(), 'dotenv'

    value = os.environ.get(key)
    if value and value.strip():
        return value.strip(), 'env'

    return None, 'missing'


def get_openai_api_key() -> tuple[Optional[str], str]:
    """Obtiene OPENAI_API_KEY y la fuente desde la que fue resuelta."""
    return get_config_value('OPENAI_API_KEY')

def get_database_url() -> Optional[str]:
    """
    Obtiene DATABASE_URL de forma automática según el entorno:
    1. Streamlit Cloud: usa st.secrets
    2. Local: usa .env file
    3. Fallback: variable de entorno del sistema
    
    Returns:
        str: URL de conexión a PostgreSQL o None para usar SQLite
    """
    if hasattr(st, 'secrets'):
        print("🔍 DEBUG: st.secrets está disponible")
        try:
            secrets_keys = list(st.secrets.keys()) if hasattr(st.secrets, 'keys') else []
            print(f"🔍 DEBUG: Keys en secrets: {secrets_keys}")
        except Exception:
            pass

    database_url, source = get_config_value('DATABASE_URL')
    if database_url:
        print(f"✅ Usando DATABASE_URL desde {source}")
        print(f"🔍 DEBUG: URL encontrada (primeros 30 chars): {database_url[:30]}...")
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
            playbook_name TEXT DEFAULT 'General',
            tenant_id TEXT REFERENCES tenants(tenant_id),
            created_by_user_id TEXT
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
            rows_errors INTEGER,
            tenant_id TEXT REFERENCES tenants(tenant_id)
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

        tenants_table = """
        CREATE TABLE IF NOT EXISTS tenants (
            tenant_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP NOT NULL
        )
        """

        # Tablas para propuestas formales
        company_logos_table = """
        CREATE TABLE IF NOT EXISTS company_logos (
            logo_id TEXT PRIMARY KEY,
            tenant_id TEXT REFERENCES tenants(tenant_id),
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
            project_description TEXT,
            
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
            updated_at TIMESTAMP,
            tenant_id TEXT REFERENCES tenants(tenant_id)
        )
        """
    else:
        tenants_table = """
        CREATE TABLE IF NOT EXISTS tenants (
            tenant_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        )
        """

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
            playbook_name TEXT DEFAULT 'General',
            tenant_id TEXT,
            created_by_user_id TEXT
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
            tenant_id TEXT,
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
            tenant_id TEXT,
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
            project_description TEXT,
            
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
            tenant_id TEXT,
            
            FOREIGN KEY (quote_id) REFERENCES quotes(quote_id),
            FOREIGN KEY (proposal_id) REFERENCES proposals(proposal_id),
            FOREIGN KEY (issuer_logo_id) REFERENCES company_logos(logo_id),
            FOREIGN KEY (client_logo_id) REFERENCES company_logos(logo_id)
        )
        """
    
    try:
        with get_cursor() as cur:
            cur.execute(tenants_table)
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
            # Tabla de usuarios de la app
            if is_postgres():
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS app_users (
                        user_id TEXT PRIMARY KEY,
                        alias TEXT UNIQUE NOT NULL,
                        first_name TEXT NOT NULL,
                        last_name TEXT NOT NULL,
                        password_hash TEXT NOT NULL,
                        role TEXT NOT NULL DEFAULT 'user',
                        active BOOLEAN NOT NULL DEFAULT TRUE,
                        created_at TIMESTAMP NOT NULL,
                        tenant_id TEXT REFERENCES tenants(tenant_id),
                        seller_code TEXT
                    )
                """)
            else:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS app_users (
                        user_id TEXT PRIMARY KEY,
                        alias TEXT UNIQUE NOT NULL,
                        first_name TEXT NOT NULL,
                        last_name TEXT NOT NULL,
                        password_hash TEXT NOT NULL,
                        role TEXT NOT NULL DEFAULT 'user',
                        active INTEGER NOT NULL DEFAULT 1,
                        created_at TEXT NOT NULL,
                        tenant_id TEXT,
                        seller_code TEXT
                    )
                """)
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
        quote_data: Tupla con datos de la cotización (16 campos: quote_id, quote_group_id, version,
                    parent_quote_id, created_at, status, total_cost, total_revenue, gross_profit,
                    avg_margin, playbook_name, client_name, quoted_by, proposal_name,
                    tenant_id, created_by_user_id)
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
                       (quote_id, quote_group_id, version, parent_quote_id, created_at, status, total_cost, total_revenue, gross_profit, avg_margin, playbook_name, client_name, quoted_by, proposal_name, tenant_id, created_by_user_id)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
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
                    "INSERT INTO quotes (quote_id, quote_group_id, version, parent_quote_id, created_at, status, total_cost, total_revenue, gross_profit, avg_margin, playbook_name, client_name, quoted_by, proposal_name, tenant_id, created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
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


def get_all_quotes() -> list:
    """
    ⚠️ SOLO para exportación completa de BD - No usar para consultas regulares.
    Esta función NO usa cache y carga TODAS las cotizaciones.
    
    Usar en su lugar para consultas:
    - search_quotes(query, limit) para búsquedas
    - get_recent_quotes(limit) para las más recientes
    - get_quote_groups_summary(limit) para resumen de grupos
    """
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


# =========================
# Funciones de Búsqueda Optimizadas
# =========================

def clear_search_caches():
    """
    Limpia todos los cachés de búsqueda y consultas.
    Llamar después de guardar/editar/eliminar cotizaciones.
    """
    try:
        # Limpiar cachés de funciones específicas
        if hasattr(get_quote_lines, 'clear'):
            get_quote_lines.clear()
        if hasattr(get_quote_lines_full, 'clear'):
            get_quote_lines_full.clear()
        if hasattr(load_versions_for_group, 'clear'):
            load_versions_for_group.clear()
        if hasattr(load_lines_for_quote, 'clear'):
            load_lines_for_quote.clear()
        if hasattr(get_all_quotes, 'clear'):
            get_all_quotes.clear()
    except Exception as e:
        print(f"⚠️ Error limpiando cachés: {e}")


def search_quotes(query: str, limit: int = 20, tenant_id: str = None) -> list:
    """
    Busca cotizaciones por texto en múltiples campos: client_name, proposal_name, quoted_by.
    Retorna solo la última versión de cada grupo que coincida.
    
    Búsqueda inteligente: encuentra coincidencias parciales en cualquiera de los campos.
    Filtro multitenant: si tenant_id se proporciona, limita resultados a esa empresa.
    
    NO CACHEADA: Cada búsqueda es diferente, cachear acumula datos en memoria.
    
    Args:
        query: Texto a buscar (case-insensitive)
        limit: Número máximo de resultados (default: 20)
        tenant_id: ID de empresa para aislar datos. None = sin filtro (superadmin).
        
    Returns:
        Lista de tuplas con datos de cotizaciones
    """
    if not query or query.strip() == "":
        return get_recent_quotes(limit, tenant_id=tenant_id)
    
    try:
        with get_cursor() as cur:
            search_pattern = f"%{query}%"
            
            if is_postgres():
                tenant_filter = "AND q.tenant_id = %s" if tenant_id else ""
                tenant_inner_filter = "AND tenant_id = %s" if tenant_id else ""
                params_inner = [search_pattern, search_pattern, search_pattern, search_pattern]
                if tenant_id:
                    params_inner.append(tenant_id)
                params_outer = [search_pattern, search_pattern, search_pattern, search_pattern]
                if tenant_id:
                    params_outer.append(tenant_id)
                params_outer.append(limit)
                cur.execute(f"""
                    SELECT q.quote_id, q.quote_group_id, q.version, q.parent_quote_id,
                           q.created_at, q.status, q.total_cost, q.total_revenue,
                           q.gross_profit, q.avg_margin, q.playbook_name, q.client_name,
                           q.quoted_by, q.proposal_name
                    FROM quotes q
                    INNER JOIN (
                        SELECT quote_group_id, MAX(version) as max_version
                        FROM quotes
                        WHERE (LOWER(client_name) LIKE LOWER(%s)
                           OR LOWER(proposal_name) LIKE LOWER(%s)
                           OR LOWER(quoted_by) LIKE LOWER(%s)
                           OR CAST(total_revenue AS TEXT) LIKE %s)
                        {tenant_inner_filter}
                        GROUP BY quote_group_id
                    ) latest ON q.quote_group_id = latest.quote_group_id 
                            AND q.version = latest.max_version
                    WHERE (LOWER(q.client_name) LIKE LOWER(%s)
                       OR LOWER(q.proposal_name) LIKE LOWER(%s)
                       OR LOWER(q.quoted_by) LIKE LOWER(%s)
                       OR CAST(q.total_revenue AS TEXT) LIKE %s)
                    {tenant_filter}
                    ORDER BY q.created_at DESC
                    LIMIT %s
                """, params_inner + params_outer)
            else:
                tenant_filter = "AND q.tenant_id = ?" if tenant_id else ""
                tenant_inner_filter = "AND tenant_id = ?" if tenant_id else ""
                params_inner = [search_pattern, search_pattern, search_pattern, search_pattern]
                if tenant_id:
                    params_inner.append(tenant_id)
                params_outer = [search_pattern, search_pattern, search_pattern, search_pattern]
                if tenant_id:
                    params_outer.append(tenant_id)
                params_outer.append(limit)
                cur.execute(f"""
                    SELECT q.quote_id, q.quote_group_id, q.version, q.parent_quote_id,
                           q.created_at, q.status, q.total_cost, q.total_revenue,
                           q.gross_profit, q.avg_margin, q.playbook_name, q.client_name,
                           q.quoted_by, q.proposal_name
                    FROM quotes q
                    INNER JOIN (
                        SELECT quote_group_id, MAX(version) as max_version
                        FROM quotes
                        WHERE (LOWER(client_name) LIKE LOWER(?)
                           OR LOWER(proposal_name) LIKE LOWER(?)
                           OR LOWER(quoted_by) LIKE LOWER(?)
                           OR CAST(total_revenue AS TEXT) LIKE ?)
                        {tenant_inner_filter}
                        GROUP BY quote_group_id
                    ) latest ON q.quote_group_id = latest.quote_group_id 
                            AND q.version = latest.max_version
                    ORDER BY q.created_at DESC
                    LIMIT ?
                """, params_inner + params_outer)
            
            return cur.fetchall()
    except Exception as e:
        st.error(f"Error en búsqueda: {e}")
        return []


def get_recent_quotes(limit: int = 20, tenant_id: str = None) -> list:
    """
    Obtiene las cotizaciones más recientes (última versión de cada grupo).
    Filtro multitenant: si tenant_id se proporciona, limita resultados a esa empresa.
    
    NO CACHEADA: Datos cambian frecuentemente, mejor traer frescos.
    
    Args:
        limit: Número máximo de resultados (default: 20)
        tenant_id: ID de empresa para aislar datos. None = sin filtro (superadmin).
        
    Returns:
        Lista de tuplas con datos de cotizaciones
    """
    try:
        with get_cursor() as cur:
            if is_postgres():
                tenant_filter = "WHERE q.tenant_id = %s" if tenant_id else ""
                params = (tenant_id, limit) if tenant_id else (limit,)
                cur.execute(f"""
                    SELECT q.quote_id, q.quote_group_id, q.version, q.parent_quote_id,
                           q.created_at, q.status, q.total_cost, q.total_revenue,
                           q.gross_profit, q.avg_margin, q.playbook_name, q.client_name,
                           q.quoted_by, q.proposal_name
                    FROM quotes q
                    INNER JOIN (
                        SELECT quote_group_id, MAX(version) as max_version
                        FROM quotes
                        GROUP BY quote_group_id
                    ) latest ON q.quote_group_id = latest.quote_group_id 
                            AND q.version = latest.max_version
                    {tenant_filter}
                    ORDER BY q.created_at DESC
                    LIMIT %s
                """, params)
            else:
                tenant_filter = "AND q.tenant_id = ?" if tenant_id else ""
                params = (tenant_id, limit) if tenant_id else (limit,)
                cur.execute(f"""
                    SELECT q.quote_id, q.quote_group_id, q.version, q.parent_quote_id,
                           q.created_at, q.status, q.total_cost, q.total_revenue,
                           q.gross_profit, q.avg_margin, q.playbook_name, q.client_name,
                           q.quoted_by, q.proposal_name
                    FROM quotes q
                    INNER JOIN (
                        SELECT quote_group_id, MAX(version) as max_version
                        FROM quotes
                        GROUP BY quote_group_id
                    ) latest ON q.quote_group_id = latest.quote_group_id 
                            AND q.version = latest.max_version
                    {tenant_filter}
                    ORDER BY q.created_at DESC
                    LIMIT ?
                """, params)
            
            return cur.fetchall()
    except Exception as e:
        st.error(f"Error obteniendo cotizaciones recientes: {e}")
        return []


def get_quote_groups_summary(limit: int = 100, tenant_id: str = None) -> list:
    """
    Obtiene un resumen de grupos de cotizaciones (1 fila por grupo).
    Incluye información de la última versión y conteo de versiones.
    Filtro multitenant: si tenant_id se proporciona, limita resultados a esa empresa.
    
    NO CACHEADA: Datos dinámicos que cambian con cada operación.
    
    Args:
        limit: Número máximo de grupos (default: 100)
        tenant_id: ID de empresa para aislar datos. None = sin filtro (superadmin).
        
    Returns:
        Lista de diccionarios con información resumida
    """
    try:
        with get_cursor() as cur:
            if is_postgres():
                tenant_filter = "WHERE tenant_id = %s" if tenant_id else ""
                params = (tenant_id, tenant_id, limit) if tenant_id else (limit,)
                cur.execute(f"""
                    WITH latest_versions AS (
                        SELECT DISTINCT ON (quote_group_id)
                            quote_group_id,
                            quote_id,
                            version,
                            created_at,
                            status,
                            total_revenue,
                            avg_margin,
                            client_name,
                            proposal_name,
                            playbook_name
                        FROM quotes
                        {tenant_filter}
                        ORDER BY quote_group_id, version DESC
                    ),
                    version_counts AS (
                        SELECT quote_group_id, COUNT(*) as version_count
                        FROM quotes
                        {"WHERE tenant_id = %s" if tenant_id else ""}
                        GROUP BY quote_group_id
                    )
                    SELECT 
                        lv.quote_group_id,
                        lv.quote_id,
                        lv.version,
                        vc.version_count,
                        lv.created_at,
                        lv.status,
                        lv.total_revenue,
                        lv.avg_margin,
                        lv.client_name,
                        lv.proposal_name,
                        lv.playbook_name
                    FROM latest_versions lv
                    JOIN version_counts vc ON lv.quote_group_id = vc.quote_group_id
                    ORDER BY lv.created_at DESC
                    LIMIT %s
                """, params)
            else:
                tenant_filter_inner = "AND q.tenant_id = ?" if tenant_id else ""
                tenant_filter_counts = "WHERE tenant_id = ?" if tenant_id else ""
                params_inner = (tenant_id,) if tenant_id else ()
                params_counts = (tenant_id,) if tenant_id else ()
                cur.execute(f"""
                    SELECT 
                        latest.quote_group_id,
                        latest.quote_id,
                        latest.version,
                        counts.version_count,
                        latest.created_at,
                        latest.status,
                        latest.total_revenue,
                        latest.avg_margin,
                        latest.client_name,
                        latest.proposal_name,
                        latest.playbook_name
                    FROM (
                        SELECT q.*
                        FROM quotes q
                        INNER JOIN (
                            SELECT quote_group_id, MAX(version) as max_version
                            FROM quotes
                            GROUP BY quote_group_id
                        ) m ON q.quote_group_id = m.quote_group_id 
                           AND q.version = m.max_version
                        {tenant_filter_inner}
                    ) latest
                    JOIN (
                        SELECT quote_group_id, COUNT(*) as version_count
                        FROM quotes
                        {tenant_filter_counts}
                        GROUP BY quote_group_id
                    ) counts ON latest.quote_group_id = counts.quote_group_id
                    ORDER BY latest.created_at DESC
                    LIMIT ?
                """, params_inner + params_counts + (limit,))
            
            results = cur.fetchall()
            
            # Convertir a lista de diccionarios para facilitar uso
            return [
                {
                    "quote_group_id": row[0],
                    "quote_id": row[1],
                    "version": row[2],
                    "version_count": row[3],
                    "created_at": row[4],
                    "status": row[5],
                    "total_revenue": row[6],
                    "avg_margin": row[7],
                    "client_name": row[8] or "Sin nombre",
                    "proposal_name": row[9] or "Sin nombre",
                    "playbook_name": row[10]
                }
                for row in results
            ]
    except Exception as e:
        st.error(f"Error obteniendo resumen de grupos: {e}")
        return []


def get_quote_by_group_id(quote_group_id: str) -> dict:
    """
    Obtiene información de un grupo de cotizaciones específico.
    
    NO CACHEADA: Búsqueda puntual, no vale la pena cachear.
    
    Args:
        quote_group_id: ID del grupo
        
    Returns:
        Diccionario con información del grupo o None si no existe
    """
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("""
                    SELECT 
                        quote_group_id,
                        quote_id,
                        version,
                        created_at,
                        status,
                        total_revenue,
                        avg_margin,
                        client_name,
                        proposal_name,
                        playbook_name,
                        quoted_by
                    FROM quotes
                    WHERE quote_group_id = %s
                    ORDER BY version DESC
                    LIMIT 1
                """, (quote_group_id,))
            else:
                cur.execute("""
                    SELECT 
                        quote_group_id,
                        quote_id,
                        version,
                        created_at,
                        status,
                        total_revenue,
                        avg_margin,
                        client_name,
                        proposal_name,
                        playbook_name,
                        quoted_by
                    FROM quotes
                    WHERE quote_group_id = ?
                    ORDER BY version DESC
                    LIMIT 1
                """, (quote_group_id,))
            
            row = cur.fetchone()
            if row:
                return {
                    "quote_group_id": row[0],
                    "quote_id": row[1],
                    "version": row[2],
                    "created_at": row[3],
                    "status": row[4],
                    "total_revenue": row[5],
                    "avg_margin": row[6],
                    "client_name": row[7] or "Sin nombre",
                    "proposal_name": row[8] or "Sin nombre",
                    "playbook_name": row[9],
                    "quoted_by": row[10] or "Sin asignar"
                }
            return None
    except Exception as e:
        st.error(f"Error obteniendo grupo: {e}")
        return None


def get_quote_by_id(quote_id: str) -> dict:
    """
    Obtiene información completa de una cotización específica por su ID.
    
    NO CACHEADA: Búsqueda puntual, no vale la pena cachear.
    
    Args:
        quote_id: ID único de la cotización
        
    Returns:
        Diccionario con información completa de la cotización o None si no existe
    """
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("""
                    SELECT 
                        quote_id,
                        quote_group_id,
                        version,
                        parent_quote_id,
                        created_at,
                        status,
                        total_cost,
                        total_revenue,
                        gross_profit,
                        avg_margin,
                        playbook_name,
                        client_name,
                        quoted_by,
                        proposal_name
                    FROM quotes
                    WHERE quote_id = %s
                    LIMIT 1
                """, (quote_id,))
            else:
                cur.execute("""
                    SELECT 
                        quote_id,
                        quote_group_id,
                        version,
                        parent_quote_id,
                        created_at,
                        status,
                        total_cost,
                        total_revenue,
                        gross_profit,
                        avg_margin,
                        playbook_name,
                        client_name,
                        quoted_by,
                        proposal_name
                    FROM quotes
                    WHERE quote_id = ?
                    LIMIT 1
                """, (quote_id,))
            
            row = cur.fetchone()
            if row:
                return {
                    "quote_id": row[0],
                    "quote_group_id": row[1],
                    "version": row[2],
                    "parent_quote_id": row[3],
                    "created_at": row[4],
                    "status": row[5],
                    "total_cost": row[6],
                    "total_revenue": row[7],
                    "gross_profit": row[8],
                    "avg_margin": row[9],
                    "playbook_name": row[10],
                    "client_name": row[11] or "Sin especificar",
                    "quoted_by": row[12] or "Sin especificar",
                    "proposal_name": row[13] or "Sin nombre"
                }
            return None
    except Exception as e:
        st.error(f"Error obteniendo cotización: {e}")
        return None


def get_quote_lines(quote_id: str) -> list:
    """Obtiene las líneas de una cotización específica (consulta bajo demanda, sin cache)."""
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


def get_quote_lines_full(quote_id: str) -> list:
    """Obtiene todas las líneas de una cotización con todos los campos (consulta bajo demanda, sin cache)."""
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


def load_versions_for_group(quote_group_id: str):
    """Carga todas las versiones de una oportunidad (consulta bajo demanda, sin cache)."""
    try:
        import pandas as pd
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("""
                    SELECT quote_id, quote_group_id, version, parent_quote_id, created_at, 
                           status, total_cost, total_revenue, gross_profit, avg_margin,
                           playbook_name, client_name, quoted_by, proposal_name
                    FROM quotes
                    WHERE quote_group_id = %s
                    ORDER BY version ASC
                """, (quote_group_id,))
            else:
                cur.execute("""
                    SELECT quote_id, quote_group_id, version, parent_quote_id, created_at, 
                           status, total_cost, total_revenue, gross_profit, avg_margin,
                           playbook_name, client_name, quoted_by, proposal_name
                    FROM quotes
                    WHERE quote_group_id = ?
                    ORDER BY version ASC
                """, (quote_group_id,))
            
            columns = ["quote_id", "quote_group_id", "version", "parent_quote_id", "created_at",
                      "status", "total_cost", "total_revenue", "gross_profit", "avg_margin",
                      "playbook_name", "client_name", "quoted_by", "proposal_name"]
            return pd.DataFrame(cur.fetchall(), columns=columns)
    except Exception as e:
        st.error(f"Error cargando versiones: {e}")
        return pd.DataFrame()


def load_lines_for_quote(quote_id: str):
    """Carga todas las líneas de una cotización para comparación (consulta bajo demanda, sin cache)."""
    try:
        import pandas as pd
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
            
            columns = ["line_id", "quote_id", "sku", "quantity", "description_original", "description_final",
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
            seen = set()
            for row in cur.fetchall():
                d = dict(zip(columns, row))
                key = (d['logo_name'], d['logo_type'])
                if key not in seen:
                    seen.add(key)
                    results.append(d)
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
                        client_type, market_sector, subject, custom_intro, project_description,
                        issuer_logo_id, client_logo_id, terms_and_conditions,
                        signature_name, signature_title, signature_image_data,
                        iva_rate, iva_included, total_pages, pdf_file_data,
                        status, created_by, created_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (
                        proposal_data['proposal_doc_id'], proposal_data.get('quote_id'), proposal_data.get('proposal_id'),
                        proposal_data['proposal_number'], proposal_data['issued_date'], proposal_data.get('valid_until'),
                        proposal_data['issuer_company'], proposal_data.get('issuer_contact_name'), proposal_data.get('issuer_contact_title'),
                        proposal_data.get('issuer_email'), proposal_data.get('issuer_phone'),
                        proposal_data['recipient_company'], proposal_data.get('recipient_contact_name'),
                        proposal_data.get('recipient_contact_title'), proposal_data.get('recipient_email'),
                        proposal_data.get('client_type'), proposal_data.get('market_sector'), proposal_data.get('subject'),
                        proposal_data.get('custom_intro'), proposal_data.get('project_description'),
                        proposal_data.get('issuer_logo_id'), proposal_data.get('client_logo_id'),
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
                        client_type, market_sector, subject, custom_intro, project_description,
                        issuer_logo_id, client_logo_id, terms_and_conditions,
                        signature_name, signature_title, signature_image_data,
                        iva_rate, iva_included, total_pages, pdf_file_data,
                        status, created_by, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        proposal_data['proposal_doc_id'], proposal_data.get('quote_id'), proposal_data.get('proposal_id'),
                        proposal_data['proposal_number'], proposal_data['issued_date'], proposal_data.get('valid_until'),
                        proposal_data['issuer_company'], proposal_data.get('issuer_contact_name'), proposal_data.get('issuer_contact_title'),
                        proposal_data.get('issuer_email'), proposal_data.get('issuer_phone'),
                        proposal_data['recipient_company'], proposal_data.get('recipient_contact_name'),
                        proposal_data.get('recipient_contact_title'), proposal_data.get('recipient_email'),
                        proposal_data.get('client_type'), proposal_data.get('market_sector'), proposal_data.get('subject'),
                        proposal_data.get('custom_intro'), proposal_data.get('project_description'),
                        proposal_data.get('issuer_logo_id'), proposal_data.get('client_logo_id'),
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


def get_formal_proposals(quote_id: str = None, status_filter: str = None, created_by_filter: str = None) -> list:
    """
    Obtiene lista de propuestas formales.
    Args:
        quote_id: Filtrar por cotización.
        status_filter: Filtrar por estado.
        created_by_filter: Si se pasa un alias/nombre, filtra solo sus propuestas.
                           Si es None o vacío, devuelve todas (admin).
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

            if created_by_filter:
                conditions.append("created_by = %s" if is_postgres() else "created_by = ?")
                params.append(created_by_filter)
            
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
            ("multitenant", "migrate_add_multitenant"),
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


# ====================================
# Gestión de Usuarios
# ====================================

def _hash_password(password: str) -> str:
    """Genera hash seguro de contraseña con bcrypt."""
    import bcrypt
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def _check_password(password: str, hashed: str) -> bool:
    """Verifica contraseña contra su hash."""
    import bcrypt
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


def create_user(alias: str, first_name: str, last_name: str, password: str, role: str = 'user', tenant_id: str = None, seller_code: str = None) -> tuple[bool, str]:
    """Crea un nuevo usuario. Retorna (success, mensaje)."""
    from datetime import datetime, UTC
    import uuid
    try:
        user_id = str(uuid.uuid4())
        password_hash = _hash_password(password)
        created_at = datetime.now(UTC).isoformat()
        with get_cursor() as cur:
            if is_postgres():
                cur.execute(
                    "INSERT INTO app_users (user_id, alias, first_name, last_name, password_hash, role, active, created_at, tenant_id, seller_code) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (user_id, alias.lower(), first_name, last_name, password_hash, role, True, created_at, tenant_id, seller_code)
                )
            else:
                cur.execute(
                    "INSERT INTO app_users (user_id, alias, first_name, last_name, password_hash, role, active, created_at, tenant_id, seller_code) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (user_id, alias.lower(), first_name, last_name, password_hash, role, 1, created_at, tenant_id, seller_code)
                )
        return True, f"Usuario '{alias}' creado correctamente"
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            return False, f"El alias '{alias}' ya existe"
        return False, f"Error creando usuario: {e}"


def authenticate_user(alias: str, password: str) -> dict | None:
    """
    Verifica credenciales. Retorna dict con datos del usuario o None si falla.
    """
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute(
                    "SELECT user_id, alias, first_name, last_name, password_hash, role, active, tenant_id, seller_code FROM app_users WHERE alias=%s",
                    (alias.lower(),)
                )
            else:
                cur.execute(
                    "SELECT user_id, alias, first_name, last_name, password_hash, role, active, tenant_id, seller_code FROM app_users WHERE alias=?",
                    (alias.lower(),)
                )
            row = cur.fetchone()
        if not row:
            return None
        user_id, alias_db, first_name, last_name, password_hash, role, active, tenant_id, seller_code = row
        if not active:
            return None
        if not _check_password(password, password_hash):
            return None
        return {
            'user_id': user_id,
            'alias': alias_db,
            'first_name': first_name,
            'last_name': last_name,
            'full_name': f"{first_name} {last_name}",
            'role': role,
            'tenant_id': tenant_id,
            'seller_code': seller_code,
        }
    except Exception as e:
        print(f"Error en authenticate_user: {e}")
        return None


def get_user_by_id(user_id: str) -> dict | None:
    """Obtiene un usuario por ID para refrescar sesión y permisos."""
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute(
                    "SELECT user_id, alias, first_name, last_name, role, active, tenant_id, seller_code FROM app_users WHERE user_id=%s",
                    (user_id,)
                )
            else:
                cur.execute(
                    "SELECT user_id, alias, first_name, last_name, role, active, tenant_id, seller_code FROM app_users WHERE user_id=?",
                    (user_id,)
                )
            row = cur.fetchone()
        if not row:
            return None
        user_id_db, alias_db, first_name, last_name, role, active, tenant_id, seller_code = row
        if not active:
            return None
        return {
            'user_id': user_id_db,
            'alias': alias_db,
            'first_name': first_name,
            'last_name': last_name,
            'full_name': f"{first_name} {last_name}",
            'role': role,
            'tenant_id': tenant_id,
            'seller_code': seller_code,
        }
    except Exception as e:
        print(f"Error en get_user_by_id: {e}")
        return None


def get_all_users(tenant_id: str = None) -> list:
    """Retorna todos los usuarios (para panel admin). Filtra por tenant si se proporciona."""
    try:
        with get_cursor() as cur:
            if tenant_id:
                query = "SELECT user_id, alias, first_name, last_name, role, active, created_at, tenant_id, seller_code FROM app_users WHERE tenant_id = {} ORDER BY created_at DESC"
                if is_postgres():
                    cur.execute(query.format("%s"), (tenant_id,))
                else:
                    cur.execute(query.format("?"), (tenant_id,))
            else:
                cur.execute("SELECT user_id, alias, first_name, last_name, role, active, created_at, tenant_id, seller_code FROM app_users ORDER BY created_at DESC")
            rows = cur.fetchall()
        return [
            {'user_id': r[0], 'alias': r[1], 'first_name': r[2], 'last_name': r[3],
             'full_name': f"{r[2]} {r[3]}", 'role': r[4], 'active': bool(r[5]), 'created_at': r[6],
             'tenant_id': r[7], 'seller_code': r[8]}
            for r in rows
        ]
    except Exception as e:
        print(f"Error en get_all_users: {e}")
        return []

def toggle_user_active(user_id: str, active: bool) -> tuple[bool, str]:
    """Activa o desactiva un usuario."""
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("UPDATE app_users SET active=%s WHERE user_id=%s", (active, user_id))
            else:
                cur.execute("UPDATE app_users SET active=? WHERE user_id=?", (1 if active else 0, user_id))
        return True, "Usuario actualizado"
    except Exception as e:
        return False, f"Error: {e}"


def update_user_password(user_id: str, new_password: str) -> tuple[bool, str]:
    """Cambia la contraseña de un usuario."""
    try:
        new_hash = _hash_password(new_password)
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("UPDATE app_users SET password_hash=%s WHERE user_id=%s", (new_hash, user_id))
            else:
                cur.execute("UPDATE app_users SET password_hash=? WHERE user_id=?", (new_hash, user_id))
        return True, "Contraseña actualizada"
    except Exception as e:
        return False, f"Error: {e}"


def users_exist() -> bool:
    """Verifica si ya hay usuarios creados en el sistema."""
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("SELECT COUNT(*) FROM app_users")
            else:
                cur.execute("SELECT COUNT(*) FROM app_users")
            return cur.fetchone()[0] > 0
    except Exception:
        return False


# ====================================
# Gestión de Empresas (Tenants)
# ====================================

def create_tenant(name: str, slug: str) -> tuple[bool, str, str]:
    """
    Crea una nueva empresa/tenant.

    Args:
        name: Nombre visible de la empresa (ej. "Acme Corp")
        slug: Identificador corto único (ej. "acme", solo minúsculas y guiones)

    Returns:
        Tupla (success: bool, message: str, tenant_id: str)
    """
    import uuid
    from datetime import datetime, UTC
    try:
        tenant_id = str(uuid.uuid4())
        created_at = datetime.now(UTC).isoformat()
        slug_clean = slug.lower().strip().replace(" ", "-")
        with get_cursor() as cur:
            if is_postgres():
                cur.execute(
                    "INSERT INTO tenants (tenant_id, name, slug, active, created_at) VALUES (%s,%s,%s,%s,%s)",
                    (tenant_id, name.strip(), slug_clean, True, created_at)
                )
            else:
                cur.execute(
                    "INSERT INTO tenants (tenant_id, name, slug, active, created_at) VALUES (?,?,?,?,?)",
                    (tenant_id, name.strip(), slug_clean, 1, created_at)
                )
        return True, f"Empresa '{name}' creada correctamente", tenant_id
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            return False, f"El slug '{slug}' ya existe", ""
        return False, f"Error creando empresa: {e}", ""


def get_all_tenants() -> list:
    """Retorna todas las empresas registradas."""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT tenant_id, name, slug, active, created_at FROM tenants ORDER BY name ASC")
            rows = cur.fetchall()
        return [
            {'tenant_id': r[0], 'name': r[1], 'slug': r[2], 'active': bool(r[3]), 'created_at': r[4]}
            for r in rows
        ]
    except Exception as e:
        print(f"Error en get_all_tenants: {e}")
        return []


def get_tenant(tenant_id: str) -> dict | None:
    """Retorna los datos de una empresa por su ID."""
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("SELECT tenant_id, name, slug, active, created_at FROM tenants WHERE tenant_id=%s", (tenant_id,))
            else:
                cur.execute("SELECT tenant_id, name, slug, active, created_at FROM tenants WHERE tenant_id=?", (tenant_id,))
            row = cur.fetchone()
        if row:
            return {'tenant_id': row[0], 'name': row[1], 'slug': row[2], 'active': bool(row[3]), 'created_at': row[4]}
        return None
    except Exception as e:
        print(f"Error en get_tenant: {e}")
        return None


def toggle_tenant_active(tenant_id: str, active: bool) -> tuple[bool, str]:
    """Activa o desactiva una empresa (y sus usuarios implícitamente)."""
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("UPDATE tenants SET active=%s WHERE tenant_id=%s", (active, tenant_id))
            else:
                cur.execute("UPDATE tenants SET active=? WHERE tenant_id=?", (1 if active else 0, tenant_id))
        estado = "activada" if active else "desactivada"
        return True, f"Empresa {estado} correctamente"
    except Exception as e:
        return False, f"Error: {e}"


def update_user_seller_code(user_id: str, seller_code: str) -> tuple[bool, str]:
    """Actualiza el código de vendedor de un usuario."""
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("UPDATE app_users SET seller_code=%s WHERE user_id=%s", (seller_code.upper().strip(), user_id))
            else:
                cur.execute("UPDATE app_users SET seller_code=? WHERE user_id=?", (seller_code.upper().strip(), user_id))
        return True, "Código de vendedor actualizado"
    except Exception as e:
        return False, f"Error: {e}"


def update_user_tenant(user_id: str, tenant_id: str) -> tuple[bool, str]:
    """Asigna o cambia la empresa de un usuario."""
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute("UPDATE app_users SET tenant_id=%s WHERE user_id=%s", (tenant_id, user_id))
            else:
                cur.execute("UPDATE app_users SET tenant_id=? WHERE user_id=?", (tenant_id, user_id))
        return True, "Empresa del usuario actualizada"
    except Exception as e:
        return False, f"Error: {e}"


def tenants_exist() -> bool:
    """Verifica si ya hay empresas registradas."""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM tenants")
            return cur.fetchone()[0] > 0
    except Exception:
        return False

