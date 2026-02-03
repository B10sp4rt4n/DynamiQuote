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

# Importar WeasyPrint si está disponible
try:
    from weasyprint import HTML, CSS
    WEASYPRINT_AVAILABLE = True
except ImportError:
    WEASYPRINT_AVAILABLE = False


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
    Genera PDF de la propuesta formal.
    
    Args:
        proposal_data: Datos completos de la propuesta
        quote_lines: Líneas de cotización
        template_path: Ruta al template HTML (opcional)
        
    Returns:
        Tupla (success: bool, pdf_data: bytes, error_message: str)
    """
    if not WEASYPRINT_AVAILABLE:
        return False, b"", "WeasyPrint no está instalado"
    
    try:
        # Calcular totales con moneda
        totals = calculate_totals(
            quote_lines,
            proposal_data.get('iva_rate', 0.16),
            proposal_data.get('iva_included', False),
            proposal_data.get('currency', 'MXN'),
            proposal_data.get('currency_symbol', '$')
        )
        
        # Preparar logos en base64
        from database import get_logo_data
        
        issuer_logo_base64 = ""
        if proposal_data.get('issuer_logo_id'):
            success, logo_data, logo_format = get_logo_data(proposal_data['issuer_logo_id'])
            if success:
                issuer_logo_base64 = logo_to_base64(logo_data, logo_format)
        
        client_logo_base64 = ""
        if proposal_data.get('client_logo_id'):
            success, logo_data, logo_format = get_logo_data(proposal_data['client_logo_id'])
            if success:
                client_logo_base64 = logo_to_base64(logo_data, logo_format)
        
        # Cargar template
        if template_path and os.path.exists(template_path):
            with open(template_path, 'r', encoding='utf-8') as f:
                template_str = f.read()
        else:
            # Usar template embebido
            template_str = get_embedded_template()
        
        # Renderizar HTML
        template = Template(template_str)
        html_content = template.render(
            proposal=proposal_data,
            lines=quote_lines,
            totals=totals,
            issuer_logo=issuer_logo_base64,
            client_logo=client_logo_base64
        )
        
        # Generar PDF
        pdf_file = HTML(string=html_content).write_pdf()
        
        # Calcular número de páginas (aproximado)
        total_pages = max(1, len(quote_lines) // 20 + 1)
        
        return True, pdf_file, ""
    
    except Exception as e:
        return False, b"", str(e)


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
