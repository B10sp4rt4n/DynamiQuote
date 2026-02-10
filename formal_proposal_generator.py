"""
Generador de Propuestas Formales para DynamiQuote.

Sistema completo para crear propuestas profesionales con:
- Personalización de datos emisor/receptor
- Sistema de logos (empresa emisora y cliente)
- Introducción inteligente por tipo de cliente y mercado
- Gestión de IVA (integrado o desglosado)
- Términos y condiciones editables
- Firma digital
- Generación de PDF profesional
"""

import os
import io
import uuid
import base64
from datetime import datetime, UTC, timedelta
from typing import Dict, Any, Optional, List, Tuple
import pandas as pd
from jinja2 import Template

# Importar ReportLab para generación de PDF
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, PageBreak
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT, TA_JUSTIFY
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

# Mantener compatibilidad con código existente
WEASYPRINT_AVAILABLE = REPORTLAB_AVAILABLE


# =========================
# Configuraciones y Templates
# =========================

# Tipos de cliente
CLIENT_TYPES = [
    "Corporativo",
    "PyME",
    "Gobierno",
    "Educación",
    "Salud",
    "Financiero",
    "Retail",
    "Tecnología",
    "Manufactura",
    "Servicios"
]

# Sectores de mercado
MARKET_SECTORS = [
    "Tecnología de la Información",
    "Telecomunicaciones",
    "Construcción e Infraestructura",
    "Servicios Profesionales",
    "Manufactura",
    "Retail y Comercio",
    "Salud",
    "Educación",
    "Gobierno y Sector Público",
    "Financiero",
    "Energía",
    "Logística y Transporte"
]

# Términos y condiciones por defecto
DEFAULT_TERMS = """
**TÉRMINOS Y CONDICIONES**

1. **Vigencia de la Propuesta**: Esta propuesta tiene una validez de 30 días naturales a partir de la fecha de emisión.

2. **Forma de Pago**: 
   - 50% anticipo al inicio del proyecto
   - 50% contra entrega y aceptación

3. **Tiempo de Entrega**: Los tiempos de entrega serán acordados tras la aceptación de esta propuesta y pueden variar según disponibilidad.

4. **Garantía**: Los productos y servicios están respaldados por la garantía del fabricante o proveedor original.

5. **Alcance**: Esta propuesta incluye únicamente los conceptos descritos. Cualquier servicio adicional será cotizado por separado.

6. **Aceptación**: La aceptación de esta propuesta se considera efectiva mediante firma de autorización y pago del anticipo correspondiente.

7. **Confidencialidad**: La información contenida en este documento es confidencial y de uso exclusivo del destinatario.
"""


# =========================
# Generación de Número de Propuesta
# =========================

def generate_proposal_number(prefix: str = "PROP") -> str:
    """
    Genera un número de propuesta único.
    Formato: PROP-YYYY-XXXX (ej: PROP-2026-0001)
    
    Args:
        prefix: Prefijo para el número (default: PROP)
        
    Returns:
        Número de propuesta único
    """
    current_year = datetime.now(UTC).year
    
    # Intentar obtener el último número del año actual
    from database import get_cursor, is_postgres
    
    try:
        with get_cursor() as cur:
            if is_postgres():
                cur.execute(
                    "SELECT proposal_number FROM formal_proposals WHERE proposal_number LIKE %s ORDER BY created_at DESC LIMIT 1",
                    (f"{prefix}-{current_year}-%",)
                )
            else:
                cur.execute(
                    "SELECT proposal_number FROM formal_proposals WHERE proposal_number LIKE ? ORDER BY created_at DESC LIMIT 1",
                    (f"{prefix}-{current_year}-%",)
                )
            
            result = cur.fetchone()
            if result:
                last_number = int(result[0].split("-")[-1])
                new_number = last_number + 1
            else:
                new_number = 1
    except:
        # Si hay error o no hay conexión, generar número aleatorio
        new_number = 1
    
    return f"{prefix}-{current_year}-{new_number:04d}"


# =========================
# Generación de Introducción Inteligente
# =========================

def generate_intro_text(
    recipient_company: str,
    recipient_contact_name: str,
    client_type: str,
    market_sector: str,
    issuer_company: str,
    use_ai: bool = False,
    openai_api_key: str = None
) -> str:
    """
    Genera texto de introducción personalizado para la propuesta.
    
    Args:
        recipient_company: Nombre de la empresa receptora
        recipient_contact_name: Nombre del contacto
        client_type: Tipo de cliente
        market_sector: Sector de mercado
        issuer_company: Nombre de la empresa emisora
        use_ai: Si usar OpenAI para generar texto más personalizado
        openai_api_key: API Key de OpenAI (si use_ai=True)
        
    Returns:
        Texto de introducción formateado
    """
    
    if use_ai and openai_api_key:
        try:
            ai_intro = generate_intro_with_ai(
                recipient_company, recipient_contact_name, 
                client_type, market_sector, issuer_company, 
                openai_api_key
            )
            if ai_intro:  # Si se generó exitosamente, usarla
                return ai_intro
        except:
            pass  # Si falla, usar template estándar
    
    # Template estándar basado en tipo de cliente y sector
    greetings = {
        "Corporativo": f"Estimado(a) {recipient_contact_name}:",
        "PyME": f"Estimado(a) {recipient_contact_name}:",
        "Gobierno": f"C. {recipient_contact_name}:",
        "Educación": f"Distinguido(a) {recipient_contact_name}:",
        "default": f"Estimado(a) {recipient_contact_name}:"
    }
    
    greeting = greetings.get(client_type, greetings["default"])
    
    intro_templates = {
        "Tecnología de la Información": 
            f"Por medio de la presente, {issuer_company} tiene el agrado de presentar a {recipient_company} "
            f"nuestra propuesta de soluciones tecnológicas diseñadas específicamente para optimizar sus procesos "
            f"y fortalecer su infraestructura de TI.",
        
        "Construcción e Infraestructura":
            f"Por medio de la presente, {issuer_company} se complace en presentar a {recipient_company} "
            f"nuestra propuesta de servicios y materiales para el desarrollo de su proyecto, "
            f"comprometiéndonos con la calidad y cumplimiento de estándares de la industria.",
        
        "Servicios Profesionales":
            f"Es un placer para {issuer_company} presentar a {recipient_company} nuestra propuesta de "
            f"servicios profesionales, diseñada para agregar valor a sus operaciones y contribuir "
            f"al logro de sus objetivos estratégicos.",
        
        "default":
            f"Por medio de la presente, {issuer_company} tiene el agrado de presentar a {recipient_company} "
            f"nuestra propuesta comercial, la cual ha sido elaborada considerando sus necesidades específicas "
            f"y las características propias del sector {market_sector.lower()}."
    }
    
    intro_body = intro_templates.get(market_sector, intro_templates["default"])
    
    closing = (
        f"\n\nNuestra propuesta incluye una descripción detallada de los productos y servicios, "
        f"con sus respectivos costos y condiciones comerciales. Estamos convencidos de que esta "
        f"solución representa una excelente oportunidad para {recipient_company}."
        f"\n\nQuedamos a su disposición para cualquier aclaración o información adicional que requiera."
    )
    
    return f"{greeting}\n\n{intro_body}{closing}"


def generate_intro_with_ai(
    recipient_company: str,
    recipient_contact_name: str,
    client_type: str,
    market_sector: str,
    issuer_company: str,
    openai_api_key: str
) -> str:
    """
    Genera introducción usando OpenAI GPT.
    
    Returns:
        Texto de introducción generado por IA
    """
    try:
        import openai
        openai.api_key = openai_api_key
        
        prompt = f"""
Genera una introducción formal y profesional para una propuesta comercial con las siguientes características:

- Empresa emisora: {issuer_company}
- Empresa receptora: {recipient_company}
- Contacto: {recipient_contact_name}
- Tipo de cliente: {client_type}
- Sector: {market_sector}

La introducción debe:
1. Ser formal y profesional
2. Dirigirse apropiadamente al contacto
3. Mencionar el contexto del sector
4. Expresar entusiasmo por la oportunidad
5. Tener máximo 3 párrafos
6. Estar en español

No incluyas firma ni despedida, solo el cuerpo de la introducción.
"""
        
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "Eres un experto en redacción de propuestas comerciales formales en español."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=500,
            temperature=0.7
        )
        
        return response.choices[0].message.content.strip()
    
    except Exception as e:
        # Si falla, retornar None para usar template estándar
        print(f"Error generando con AI: {e}")
        return None


# =========================
# Cálculos de IVA y Totales
# =========================

def calculate_totals(
    lines: List[Dict[str, Any]],
    iva_rate: float = 0.16,
    iva_included: bool = False,
    currency: str = "MXN",
    currency_symbol: str = "$"
) -> Dict[str, Any]:
    """
    Calcula totales de la propuesta con IVA.
    
    Args:
        lines: Lista de líneas de cotización con 'quantity' y 'final_price_unit'
        iva_rate: Tasa de IVA (default 16% = 0.16)
        iva_included: Si el IVA está incluido en el precio o se agrega
        currency: Código de moneda (MXN o USD)
        currency_symbol: Símbolo de moneda ($ o US$)
        
    Returns:
        Diccionario con subtotal, iva, total, moneda
    """
    # Convertir a float para evitar errores con decimal.Decimal
    iva_rate = float(iva_rate)
    
    subtotal = sum(
        float(line.get('quantity', 0)) * float(line.get('final_price_unit', 0))
        for line in lines
    )
    
    if iva_included:
        # El precio ya incluye IVA, calculamos el monto del IVA
        total = subtotal
        iva_amount = total - (total / (1 + iva_rate))
        subtotal_sin_iva = total - iva_amount
        
        return {
            "subtotal": subtotal_sin_iva,
            "iva": iva_amount,
            "total": total,
            "iva_rate": iva_rate,
            "iva_included": True,
            "currency": currency,
            "currency_symbol": currency_symbol
        }
    else:
        # El IVA se agrega al subtotal
        iva_amount = subtotal * iva_rate
        total = subtotal + iva_amount
        
        return {
            "subtotal": subtotal,
            "iva": iva_amount,
            "total": total,
            "iva_rate": iva_rate,
            "iva_included": False,
            "currency": currency,
            "currency_symbol": currency_symbol
        }


# =========================
# Utilidades para Logos
# =========================

def logo_to_base64(logo_data: bytes, logo_format: str) -> str:
    """
    Convierte logo a base64 para embedding en HTML.
    
    Args:
        logo_data: Datos binarios del logo
        logo_format: Formato (png, jpg, svg)
        
    Returns:
        String base64 para data URI
    """
    encoded = base64.b64encode(logo_data).decode('utf-8')
    mime_types = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'svg': 'image/svg+xml'
    }
    mime = mime_types.get(logo_format.lower(), 'image/png')
    return f"data:{mime};base64,{encoded}"


def process_logo_upload(uploaded_file) -> Tuple[bytes, str]:
    """
    Procesa archivo de logo subido en Streamlit.
    
    Args:
        uploaded_file: Archivo de Streamlit file_uploader
        
    Returns:
        Tupla (logo_data: bytes, logo_format: str)
    """
    logo_data = uploaded_file.read()
    logo_format = uploaded_file.name.split('.')[-1].lower()
    
    # Validar formato
    valid_formats = ['png', 'jpg', 'jpeg', 'svg']
    if logo_format not in valid_formats:
        raise ValueError(f"Formato no soportado. Use: {', '.join(valid_formats)}")
    
    # Validar tamaño (máx 2MB)
    if len(logo_data) > 2 * 1024 * 1024:
        raise ValueError("El logo debe ser menor a 2MB")
    
    return logo_data, logo_format


# =========================
# Generación de PDF
# =========================

def generate_proposal_pdf(
    proposal_data: Dict[str, Any],
    quote_lines: List[Dict[str, Any]],
    template_path: str = None
) -> Tuple[bool, bytes, str]:
    """
    Genera PDF de la propuesta formal usando ReportLab.
    
    Args:
        proposal_data: Datos completos de la propuesta
        quote_lines: Líneas de cotización
        template_path: No usado (mantiene compatibilidad API)
        
    Returns:
        Tupla (success: bool, pdf_data: bytes, error_message: str)
    """
    if not REPORTLAB_AVAILABLE:
        return False, b"", "ReportLab no está instalado"
    
    try:
        # Calcular totales con moneda
        totals = calculate_totals(
            quote_lines,
            proposal_data.get('iva_rate', 0.16),
            proposal_data.get('iva_included', False),
            proposal_data.get('currency', 'MXN'),
            proposal_data.get('currency_symbol', '$')
        )
        
        # Crear buffer para PDF
        buffer = io.BytesIO()
        
        # Crear documento
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=0.75*inch,
            leftMargin=0.75*inch,
            topMargin=0.75*inch,
            bottomMargin=0.75*inch
        )
        
        # Estilos
        styles = getSampleStyleSheet()
        
        # Estilos personalizados
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=16,
            textColor=colors.HexColor('#2c3e50'),
            spaceAfter=12,
            alignment=TA_CENTER
        )
        
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=12,
            textColor=colors.HexColor('#2c3e50'),
            spaceAfter=10,
            spaceBefore=10,
            borderWidth=1,
            borderColor=colors.HexColor('#3498db'),
            borderPadding=5
        )
        
        body_style = ParagraphStyle(
            'CustomBody',
            parent=styles['BodyText'],
            fontSize=10,
            alignment=TA_JUSTIFY,
            spaceAfter=10
        )
        
        small_style = ParagraphStyle(
            'Small',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.grey
        )
        
        # Contenido del documento
        story = []
        
        # Header con logos (si existen)
        header_data = []
        from database import get_logo_data
        
        # Logo emisor
        issuer_logo = None
        if proposal_data.get('issuer_logo_id'):
            success, logo_data, logo_format = get_logo_data(proposal_data['issuer_logo_id'])
            if success:
                try:
                    img_buffer = io.BytesIO(bytes(logo_data) if isinstance(logo_data, memoryview) else logo_data)
                    issuer_logo = Image(img_buffer, width=2*inch, height=0.8*inch, kind='proportional')
                except:
                    pass
        
        if issuer_logo:
            header_data.append(issuer_logo)
        else:
            header_data.append(Paragraph(f"<b>{proposal_data['issuer_company']}</b>", styles['Heading1']))
        
        # Logo cliente (si existe)
        client_logo = None
        if proposal_data.get('client_logo_id'):
            success, logo_data, logo_format = get_logo_data(proposal_data['client_logo_id'])
            if success:
                try:
                    img_buffer = io.BytesIO(bytes(logo_data) if isinstance(logo_data, memoryview) else logo_data)
                    client_logo = Image(img_buffer, width=2*inch, height=0.8*inch, kind='proportional')
                except:
                    pass
        
        if client_logo:
            header_data.append(client_logo)
        else:
            header_data.append(Paragraph("", styles['Normal']))
        
        # Tabla de header
        header_table = Table([header_data], colWidths=[3.5*inch, 3.5*inch])
        header_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, 0), 'LEFT'),
            ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(header_table)
        story.append(Spacer(1, 0.3*inch))
        
        # Número de propuesta
        story.append(Paragraph(
            f"<b>PROPUESTA COMERCIAL</b><br/>{proposal_data['proposal_number']}",
            title_style
        ))
        story.append(Spacer(1, 0.2*inch))
        
        # Metadata en dos columnas
        metadata_data = [
            [
                Paragraph("<b>DATOS DEL EMISOR</b>", heading_style),
                Paragraph("<b>DATOS DEL CLIENTE</b>", heading_style)
            ],
            [
                Paragraph(
                    f"<b>{proposal_data['issuer_company']}</b><br/>"
                    f"{proposal_data.get('issuer_contact_name', '')}<br/>"
                    f"{proposal_data.get('issuer_contact_title', '')}<br/>"
                    f"{proposal_data.get('issuer_email', '')}<br/>"
                    f"{proposal_data.get('issuer_phone', '')}",
                    body_style
                ),
                Paragraph(
                    f"<b>{proposal_data['recipient_company']}</b><br/>"
                    f"{proposal_data.get('recipient_contact_name', '')}<br/>"
                    f"{proposal_data.get('recipient_contact_title', '')}<br/>"
                    f"{proposal_data.get('recipient_email', '')}<br/><br/>"
                    f"<b>Fecha:</b> {proposal_data['issued_date']}<br/>"
                    f"<b>Válida hasta:</b> {proposal_data.get('valid_until', 'N/A')}",
                    body_style
                )
            ]
        ]
        
        metadata_table = Table(metadata_data, colWidths=[3.5*inch, 3.5*inch])
        metadata_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(metadata_table)
        story.append(Spacer(1, 0.2*inch))
        
        # Asunto
        if proposal_data.get('subject'):
            story.append(Paragraph(f"<b>Asunto:</b> {proposal_data['subject']}", body_style))
            story.append(Spacer(1, 0.1*inch))
        
        # Introducción
        intro_lines = proposal_data.get('custom_intro', '').split('\n')
        for line in intro_lines:
            if line.strip():
                story.append(Paragraph(line, body_style))
        story.append(Spacer(1, 0.2*inch))
        
        # ===== NUEVA PÁGINA PARA DETALLES =====
        story.append(PageBreak())
        
        # Título de detalle
        story.append(Paragraph("<b>DETALLE DE LA PROPUESTA</b>", heading_style))
        story.append(Spacer(1, 0.1*inch))
        
        # Tabla de items con celdas multilínea
        # Estilo para descripciones multilínea
        desc_style = ParagraphStyle(
            'Description',
            parent=styles['Normal'],
            fontSize=8,
            leading=10,
            alignment=TA_LEFT
        )
        
        table_data = [
            ['#', 'SKU', 'DESCRIPCIÓN', 'CANT.', 'PRECIO UNIT.', 'IMPORTE']
        ]
        
        for idx, line in enumerate(quote_lines, 1):
            quantity = float(line.get('quantity', 1))
            unit_price = float(line.get('final_price_unit', 0))
            total_price = quantity * unit_price
            
            # Descripción como Paragraph para multilínea
            description = str(line.get('description_final') or line.get('description_original', ''))
            desc_paragraph = Paragraph(description, desc_style)
            
            table_data.append([
                str(idx),
                str(line.get('sku', '-'))[:15],
                desc_paragraph,  # Ahora es Paragraph, no string
                f"{int(quantity)}",
                f"{totals['currency_symbol']}{unit_price:,.2f}",
                f"{totals['currency_symbol']}{total_price:,.2f}"
            ])
        
        items_table = Table(
            table_data,
            colWidths=[0.4*inch, 0.9*inch, 3.5*inch, 0.6*inch, 1*inch, 1*inch],
            repeatRows=1  # Repetir header en páginas siguientes
        )
        
        items_table.setStyle(TableStyle([
            # Header
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c3e50')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            
            # Body
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('ALIGN', (0, 1), (0, -1), 'CENTER'),  # #
            ('ALIGN', (3, 1), (3, -1), 'CENTER'),  # CANT
            ('ALIGN', (4, 1), (-1, -1), 'RIGHT'),  # Precios
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),  # Alinear arriba para multilínea
            
            # Grid
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
            
            # Padding para que el texto no se encime
            ('TOPPADDING', (0, 1), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ]))
        
        story.append(items_table)
        story.append(Spacer(1, 0.2*inch))
        
        # Totales
        totals_data = [
            ['', f"Moneda: {totals['currency']} ({totals['currency_symbol']})"],
            ['Subtotal:', f"{totals['currency_symbol']}{totals['subtotal']:,.2f} {totals['currency']}"],
            [f"IVA ({int(totals['iva_rate']*100)}%):", f"{totals['currency_symbol']}{totals['iva']:,.2f} {totals['currency']}"],
            ['TOTAL:', f"{totals['currency_symbol']}{totals['total']:,.2f} {totals['currency']}"]
        ]
        
        totals_table = Table(totals_data, colWidths=[2*inch, 2*inch])
        totals_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, 0), 8),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.grey),
            ('FONTNAME', (0, 1), (-1, 2), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, 2), 10),
            ('FONTNAME', (0, 3), (-1, 3), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 3), (-1, 3), 12),
            ('LINEABOVE', (0, 3), (-1, 3), 2, colors.HexColor('#2c3e50')),
            ('LINEBELOW', (0, 3), (-1, 3), 2, colors.HexColor('#2c3e50')),
        ]))
        
        # Alinear totales a la derecha
        totals_container = Table([[totals_table]], colWidths=[7*inch])
        totals_container.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, 0), 'RIGHT'),
        ]))
        story.append(totals_container)
        story.append(Spacer(1, 0.3*inch))
        
        # Términos y condiciones
        if proposal_data.get('terms_and_conditions'):
            story.append(Paragraph("<b>TÉRMINOS Y CONDICIONES</b>", heading_style))
            terms_lines = proposal_data['terms_and_conditions'].split('\n')
            for line in terms_lines:
                if line.strip():
                    story.append(Paragraph(line, small_style))
            story.append(Spacer(1, 0.3*inch))
        
        # Firma
        story.append(Spacer(1, 0.5*inch))
        signature_style = ParagraphStyle(
            'Signature',
            parent=styles['Normal'],
            fontSize=11,
            alignment=TA_CENTER
        )
        
        story.append(Paragraph("_" * 50, signature_style))
        story.append(Spacer(1, 0.1*inch))
        story.append(Paragraph(f"<b>{proposal_data['issuer_company']}</b>", signature_style))
        if proposal_data.get('signature_name'):
            story.append(Paragraph(proposal_data['signature_name'], signature_style))
        if proposal_data.get('signature_title'):
            story.append(Paragraph(proposal_data['signature_title'], signature_style))
        
        # Función para agregar número de página
        def add_page_number(canvas, doc):
            """
            Agrega número de página en el pie de cada página.
            """
            page_num = canvas.getPageNumber()
            text = f"Página {page_num}"
            canvas.saveState()
            canvas.setFont('Helvetica', 9)
            canvas.setFillColor(colors.grey)
            canvas.drawRightString(7.5*inch, 0.5*inch, text)
            canvas.restoreState()
        
        # Generar PDF con numeración de páginas
        doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
        
        pdf_data = buffer.getvalue()
        buffer.close()
        
        return True, pdf_data, ""
    
    except Exception as e:
        import traceback
        return False, b"", f"{str(e)}\n{traceback.format_exc()}"


def get_embedded_template() -> str:
    """
    Retorna template HTML embebido para propuestas.
    Este es un fallback si no existe archivo de template.
    """
    return """
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Propuesta Comercial - {{ proposal.proposal_number }}</title>
    <style>
        @page {
            size: letter;
            margin: 2cm;
            @bottom-right {
                content: "Página " counter(page) " de " counter(pages);
                font-size: 9pt;
                color: #666;
            }
        }
        
        body {
            font-family: 'Helvetica', 'Arial', sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #333;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 15px;
            border-bottom: 3px solid #2c3e50;
        }
        
        .header-logo {
            max-width: 200px;
            max-height: 80px;
        }
        
        .proposal-number {
            text-align: right;
            font-size: 14pt;
            font-weight: bold;
            color: #2c3e50;
        }
        
        .metadata {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
            font-size: 10pt;
        }
        
        .metadata-section {
            width: 48%;
        }
        
        .metadata-section h3 {
            font-size: 11pt;
            color: #2c3e50;
            border-bottom: 2px solid #3498db;
            padding-bottom: 5px;
            margin-bottom: 10px;
        }
        
        .intro {
            margin-bottom: 30px;
            text-align: justify;
            white-space: pre-wrap;
        }
        
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            font-size: 10pt;
        }
        
        .items-table thead {
            background-color: #2c3e50;
            color: white;
        }
        
        .items-table th {
            padding: 10px;
            text-align: left;
            font-weight: bold;
        }
        
        .items-table td {
            padding: 8px;
            border-bottom: 1px solid #ddd;
        }
        
        .items-table tbody tr:hover {
            background-color: #f5f5f5;
        }
        
        .totals {
            margin-top: 20px;
            float: right;
            width: 40%;
        }
        
        .totals table {
            width: 100%;
            font-size: 11pt;
        }
        
        .totals td {
            padding: 5px;
        }
        
        .totals .total-row {
            font-weight: bold;
            font-size: 13pt;
            border-top: 2px solid #2c3e50;
            border-bottom: 3px double #2c3e50;
        }
        
        .terms {
            clear: both;
            margin-top: 40px;
            padding: 20px;
            background-color: #f9f9f9;
            border-left: 4px solid #3498db;
            font-size: 9pt;
            page-break-inside: avoid;
            white-space: pre-wrap;
            line-height: 1.6;
        }
        
        .signature {
            margin-top: 60px;
            text-align: center;
        }
        
        .signature-person {
            font-size: 11pt;
            color: #333;
            margin-bottom: 3px;
        }
        
        .signature-name {
            font-weight: bold;
            font-size: 14pt;
            color: #2c3e50;
            margin-top: 10px;
        }
        
        .signature-title {
            font-size: 10pt;
            color: #666;
        }
        
        .text-right {
            text-align: right;
        }
        
        .text-center {
            text-align: center;
        }
        
        .money {
            font-family: 'Courier New', monospace;
        }
    </style>
</head>
<body>
    <!-- Header con logos -->
    <div class="header">
        <div>
            {% if issuer_logo %}
            <img src="{{ issuer_logo }}" alt="Logo" class="header-logo">
            {% else %}
            <h1 style="margin:0;">{{ proposal.issuer_company }}</h1>
            {% endif %}
        </div>
        <div>
            {% if client_logo %}
            <img src="{{ client_logo }}" alt="Cliente" class="header-logo">
            {% endif %}
        </div>
    </div>
    
    <div class="proposal-number">
        PROPUESTA COMERCIAL<br>
        {{ proposal.proposal_number }}
    </div>
    
    <!-- Metadata -->
    <div class="metadata">
        <div class="metadata-section">
            <h3>DATOS DEL EMISOR</h3>
            <strong>{{ proposal.issuer_company }}</strong><br>
            {% if proposal.issuer_contact_name %}{{ proposal.issuer_contact_name }}<br>{% endif %}
            {% if proposal.issuer_contact_title %}{{ proposal.issuer_contact_title }}<br>{% endif %}
            {% if proposal.issuer_email %}{{ proposal.issuer_email }}<br>{% endif %}
            {% if proposal.issuer_phone %}{{ proposal.issuer_phone }}{% endif %}
        </div>
        <div class="metadata-section">
            <h3>DATOS DEL CLIENTE</h3>
            <strong>{{ proposal.recipient_company }}</strong><br>
            {% if proposal.recipient_contact_name %}{{ proposal.recipient_contact_name }}<br>{% endif %}
            {% if proposal.recipient_contact_title %}{{ proposal.recipient_contact_title }}<br>{% endif %}
            {% if proposal.recipient_email %}{{ proposal.recipient_email }}{% endif %}
            <br><br>
            <strong>Fecha:</strong> {{ proposal.issued_date }}<br>
            {% if proposal.valid_until %}<strong>Válida hasta:</strong> {{ proposal.valid_until }}{% endif %}
        </div>
    </div>
    
    {% if proposal.subject %}
    <p><strong>Asunto:</strong> {{ proposal.subject }}</p>
    {% endif %}
    
    <!-- Introducción -->
    <div class="intro">
        {{ proposal.custom_intro }}
    </div>
    
    <!-- Tabla de items -->
    <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 5px;">DETALLE DE LA PROPUESTA</h2>
    
    <table class="items-table">
        <thead>
            <tr>
                <th style="width: 5%;">#</th>
                <th style="width: 12%;">SKU</th>
                <th style="width: 43%;">DESCRIPCIÓN</th>
                <th style="width: 10%; text-align: center;">CANT.</th>
                <th style="width: 15%; text-align: right;">PRECIO UNIT.</th>
                <th style="width: 15%; text-align: right;">IMPORTE</th>
            </tr>
        </thead>
        <tbody>
            {% for line in lines %}
            <tr>
                <td>{{ loop.index }}</td>
                <td>{{ line.sku or '-' }}</td>
                <td>{{ line.description_final or line.description_original }}</td>
                <td class="text-center">{{ "%.0f"|format(line.quantity|float) }}</td>
                <td class="text-right money">{{ totals.currency_symbol }}{{ "%.2f"|format(line.final_price_unit|float) }}</td>
                <td class="text-right money">{{ totals.currency_symbol }}{{ "%.2f"|format((line.quantity|float) * (line.final_price_unit|float)) }}</td>
            </tr>
            {% endfor %}
        </tbody>
    </table>
    
    <!-- Totales -->
    <div class="totals">
        <div style="text-align: right; margin-bottom: 10px; font-size: 10pt; color: #666;">
            <em>Moneda: {{ totals.currency }} ({{ totals.currency_symbol }})</em>
        </div>
        <table>
            <tr>
                <td>Subtotal:</td>
                <td class="text-right money">{{ totals.currency_symbol }}{{ "%.2f"|format(totals.subtotal) }} {{ totals.currency }}</td>
            </tr>
            <tr>
                <td>IVA ({{ (totals.iva_rate * 100)|int }}%){% if totals.iva_included %} <em>(incluido)</em>{% endif %}:</td>
                <td class="text-right money">{{ totals.currency_symbol }}{{ "%.2f"|format(totals.iva) }} {{ totals.currency }}</td>
            </tr>
            <tr class="total-row">
                <td>TOTAL:</td>
                <td class="text-right money">{{ totals.currency_symbol }}{{ "%.2f"|format(totals.total) }} {{ totals.currency }}</td>
            </tr>
        </table>
    </div>
    
    <!-- Términos y condiciones -->
    {% if proposal.terms_and_conditions %}
    <div class="terms">
        {{ proposal.terms_and_conditions }}
    </div>
    {% endif %}
    
    <!-- Firma -->
    <div class="signature">
        <div class="signature-name">{{ proposal.issuer_company }}</div>
        {% if proposal.signature_name %}
        <div class="signature-person">{{ proposal.signature_name }}</div>
        {% endif %}
        {% if proposal.signature_title %}
        <div class="signature-person">{{ proposal.signature_title }}</div>
        {% endif %}
    </div>
</body>
</html>
"""


# =========================
# Función Principal
# =========================

def create_formal_proposal(
    quote_id: str = None,
    proposal_id: str = None,
    issuer_data: Dict[str, str] = None,
    recipient_data: Dict[str, str] = None,
    context_data: Dict[str, str] = None,
    logo_ids: Dict[str, str] = None,
    terms: str = None,
    signature_data: Dict[str, str] = None,
    iva_config: Dict[str, Any] = None,
    created_by: str = "system"
) -> Tuple[bool, str, str]:
    """
    Función principal para crear una propuesta formal completa.
    
    Args:
        quote_id: ID de cotización origen
        proposal_id: ID de propuesta AUP (opcional)
        issuer_data: Datos del emisor
        recipient_data: Datos del receptor
        context_data: Datos de contexto (tipo cliente, sector, asunto)
        logo_ids: IDs de logos (issuer_logo_id, client_logo_id)
        terms: Términos y condiciones
        signature_data: Datos de firma
        iva_config: Configuración de IVA (rate, included)
        created_by: Usuario que crea
        
    Returns:
        Tupla (success: bool, proposal_doc_id: str, message: str)
    """
    from database import save_formal_proposal, get_quote_lines_full
    
    try:
        # Validar datos requeridos
        if not issuer_data or not recipient_data:
            return False, "", "Datos de emisor y receptor son requeridos"
        
        # Obtener líneas de cotización
        if quote_id:
            quote_lines_raw = get_quote_lines_full(quote_id)
            if not quote_lines_raw:
                return False, "", "No se encontraron líneas de cotización"
            
            # Convertir tuplas a diccionarios
            columns = ["line_id", "quote_id", "sku", "quantity", "description_original", "description_final",
                      "description_corrections", "line_type", "service_origin", "cost_unit",
                      "final_price_unit", "margin_pct", "strategy", "warnings", "created_at"]
            quote_lines = []
            for row in quote_lines_raw:
                line_dict = dict(zip(columns, row))
                # Asegurar que quantity sea un número válido
                if not line_dict.get('quantity') or line_dict['quantity'] <= 0:
                    line_dict['quantity'] = 1
                quote_lines.append(line_dict)
        else:
            return False, "", "quote_id es requerido"
        
        # Generar IDs y números
        proposal_doc_id = str(uuid.uuid4())
        proposal_number = generate_proposal_number()
        
        # Fechas
        issued_date = datetime.now(UTC).date().isoformat()
        valid_until = (datetime.now(UTC) + timedelta(days=30)).date().isoformat()
        
        # Generar introducción
        custom_intro = generate_intro_text(
            recipient_data.get('company', ''),
            recipient_data.get('contact_name', ''),
            context_data.get('client_type', 'Corporativo'),
            context_data.get('market_sector', 'Tecnología de la Información'),
            issuer_data.get('company', '')
        )
        
        # Preparar datos de propuesta
        proposal_data = {
            'proposal_doc_id': proposal_doc_id,
            'quote_id': quote_id,
            'proposal_id': proposal_id,
            'proposal_number': proposal_number,
            'issued_date': issued_date,
            'valid_until': valid_until,
            
            'issuer_company': issuer_data.get('company', ''),
            'issuer_contact_name': issuer_data.get('contact_name'),
            'issuer_contact_title': issuer_data.get('contact_title'),
            'issuer_email': issuer_data.get('email'),
            'issuer_phone': issuer_data.get('phone'),
            
            'recipient_company': recipient_data.get('company', ''),
            'recipient_contact_name': recipient_data.get('contact_name'),
            'recipient_contact_title': recipient_data.get('contact_title'),
            'recipient_email': recipient_data.get('email'),
            
            'client_type': context_data.get('client_type') if context_data else None,
            'market_sector': context_data.get('market_sector') if context_data else None,
            'subject': context_data.get('subject') if context_data else None,
            'custom_intro': custom_intro,
            
            'issuer_logo_id': logo_ids.get('issuer') if logo_ids else None,
            'client_logo_id': logo_ids.get('client') if logo_ids else None,
            
            'terms_and_conditions': terms or DEFAULT_TERMS,
            
            'signature_name': signature_data.get('name') if signature_data else None,
            'signature_title': signature_data.get('title') if signature_data else None,
            'signature_image_data': signature_data.get('image_data') if signature_data else None,
            
            'iva_rate': iva_config.get('rate', 0.16) if iva_config else 0.16,
            'iva_included': iva_config.get('included', False) if iva_config else False,
            'currency': iva_config.get('currency', 'MXN') if iva_config else 'MXN',
            'currency_symbol': iva_config.get('currency_symbol', '$') if iva_config else '$',
            
            'status': 'draft',
            'created_by': created_by,
            'created_at': datetime.now(UTC).isoformat()
        }
        
        # Generar PDF
        success, pdf_data, error = generate_proposal_pdf(proposal_data, quote_lines)
        if success:
            proposal_data['pdf_file_data'] = pdf_data
            proposal_data['total_pages'] = max(1, len(quote_lines) // 20 + 1)
        
        # Guardar en base de datos
        success, message = save_formal_proposal(proposal_data)
        
        if success:
            return True, proposal_doc_id, f"Propuesta {proposal_number} creada exitosamente"
        else:
            return False, "", message
        
    except Exception as e:
        return False, "", f"Error creando propuesta: {e}"
