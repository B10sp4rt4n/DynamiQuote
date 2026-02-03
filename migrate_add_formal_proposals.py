"""
Migración: Agregar tablas para sistema de propuestas formales.

Este script agrega las tablas necesarias para generar propuestas formales
con logos, términos y condiciones, y gestión de IVA.

Ejecutar: python migrate_add_formal_proposals.py
"""

import os
from datetime import datetime, UTC
from database import get_cursor, is_postgres


def migrate():
    """Ejecuta la migración para agregar tablas de propuestas formales."""
    
    print("🚀 Iniciando migración: Propuestas Formales")
    print(f"📊 Base de datos: {'PostgreSQL (Neon)' if is_postgres() else 'SQLite'}")
    print("-" * 60)
    
    # Tabla de logos
    if is_postgres():
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
            # Crear tabla de logos
            print("📦 Creando tabla: company_logos...")
            cur.execute(company_logos_table)
            print("✅ Tabla company_logos creada")
            
            # Crear tabla de propuestas formales
            print("📦 Creando tabla: formal_proposals...")
            cur.execute(formal_proposals_table)
            print("✅ Tabla formal_proposals creada")
            
            # Crear índices para mejorar rendimiento
            print("🔍 Creando índices...")
            
            try:
                cur.execute("CREATE INDEX IF NOT EXISTS idx_formal_proposals_quote_id ON formal_proposals(quote_id)")
                print("✅ Índice idx_formal_proposals_quote_id creado")
            except:
                pass
            
            try:
                cur.execute("CREATE INDEX IF NOT EXISTS idx_formal_proposals_status ON formal_proposals(status)")
                print("✅ Índice idx_formal_proposals_status creado")
            except:
                pass
            
            try:
                cur.execute("CREATE INDEX IF NOT EXISTS idx_company_logos_type ON company_logos(logo_type)")
                print("✅ Índice idx_company_logos_type creado")
            except:
                pass
        
        print("-" * 60)
        print("✅ Migración completada exitosamente")
        print(f"⏰ {datetime.now(UTC).strftime('%Y-%m-%d %H:%M:%S UTC')}")
        return True
        
    except Exception as e:
        print("-" * 60)
        print(f"❌ Error durante la migración: {e}")
        return False


if __name__ == "__main__":
    success = migrate()
    exit(0 if success else 1)
