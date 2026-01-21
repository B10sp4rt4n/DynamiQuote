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

# Cargar variables de entorno
load_dotenv()

# Configuración
DATABASE_URL = os.getenv("DATABASE_URL")
SQLITE_DB = "quotes_mvp.db"


def is_postgres() -> bool:
    """Verifica si se debe usar PostgreSQL."""
    return DATABASE_URL is not None and DATABASE_URL.strip() != ""


@st.cache_resource
def get_connection():
    """
    Obtiene conexión a la base de datos (PostgreSQL o SQLite).
    Usa caché de Streamlit para mantener una sola conexión.
    """
    if is_postgres():
        try:
            import psycopg2
            return psycopg2.connect(DATABASE_URL)
        except ImportError:
            st.error("psycopg2 no está instalado. Ejecuta: pip install psycopg2-binary")
            st.stop()
        except Exception as e:
            st.error(f"Error conectando a PostgreSQL: {e}")
            st.stop()
    else:
        return sqlite3.connect(SQLITE_DB, check_same_thread=False)


@contextmanager
def get_cursor() -> Generator:
    """
    Context manager para operaciones de base de datos.
    Maneja automáticamente commit/rollback y cierre de cursor.
    
    Ejemplo:
        with get_cursor() as cur:
            cur.execute("SELECT * FROM quotes")
            results = cur.fetchall()
    """
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


def init_database():
    """Inicializa las tablas de la base de datos."""
    
    # Para PostgreSQL usamos SERIAL, para SQLite TEXT
    if is_postgres():
        quotes_table = """
        CREATE TABLE IF NOT EXISTS quotes (
            quote_id TEXT PRIMARY KEY,
            created_at TIMESTAMP,
            status TEXT,
            total_cost DECIMAL(10,2),
            total_revenue DECIMAL(10,2),
            gross_profit DECIMAL(10,2),
            avg_margin DECIMAL(5,2)
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
            created_at TIMESTAMP
        )
        """
    else:
        quotes_table = """
        CREATE TABLE IF NOT EXISTS quotes (
            quote_id TEXT PRIMARY KEY,
            created_at TEXT,
            status TEXT,
            total_cost REAL,
            total_revenue REAL,
            gross_profit REAL,
            avg_margin REAL
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
            created_at TEXT
        )
        """
    
    try:
        with get_cursor() as cur:
            cur.execute(quotes_table)
            cur.execute(quote_lines_table)
        return True, "Base de datos inicializada correctamente"
    except Exception as e:
        return False, f"Error inicializando base de datos: {e}"


def save_quote(quote_data: tuple, lines_data: list) -> tuple[bool, str]:
    """
    Guarda cotización y sus líneas en una transacción atómica.
    
    Args:
        quote_data: Tupla con datos de la cotización (7 campos)
        lines_data: Lista de tuplas con datos de líneas (14 campos cada una)
    
    Returns:
        Tupla (success: bool, message: str)
    """
    try:
        with get_cursor() as cur:
            # Insertar cotización
            if is_postgres():
                cur.execute(
                    """INSERT INTO quotes 
                       (quote_id, created_at, status, total_cost, total_revenue, gross_profit, avg_margin)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    quote_data
                )
                
                # Insertar líneas
                for line in lines_data:
                    cur.execute(
                        """INSERT INTO quote_lines 
                           (line_id, quote_id, sku, description_original, description_final,
                            description_corrections, line_type, service_origin, cost_unit,
                            final_price_unit, margin_pct, strategy, warnings, created_at)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                        line
                    )
            else:
                cur.execute(
                    "INSERT INTO quotes VALUES (?,?,?,?,?,?,?)",
                    quote_data
                )
                
                for line in lines_data:
                    cur.execute(
                        "INSERT INTO quote_lines VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        line
                    )
        
        return True, "✅ Propuesta guardada correctamente"
    
    except Exception as e:
        error_msg = str(e)
        if "duplicate" in error_msg.lower() or "unique" in error_msg.lower():
            return False, "❌ Error: Ya existe una cotización con este ID"
        return False, f"❌ Error al guardar: {error_msg}"


def get_all_quotes() -> list:
    """Obtiene todas las cotizaciones ordenadas por fecha."""
    try:
        with get_cursor() as cur:
            cur.execute("""
                SELECT quote_id, created_at, status, total_cost, total_revenue, gross_profit, avg_margin
                FROM quotes
                ORDER BY created_at DESC
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
                "icon": "☁️"
            }
        except:
            return {
                "type": "PostgreSQL (Neon)",
                "version": "Unknown",
                "connection": "Cloud",
                "icon": "☁️"
            }
    else:
        return {
            "type": "SQLite",
            "version": sqlite3.sqlite_version,
            "connection": "Local",
            "icon": "💾"
        }
