# 📄 Sistema de Propuestas Formales - DynamiQuote

## 🎯 Descripción General

Sistema completo para generar propuestas comerciales profesionales a partir de cotizaciones existentes. Permite crear documentos PDF personalizados, listos para envío a clientes, con apariencia corporativa y profesional.

---

## ✨ Características Principales

### 1. **Personalización Completa**
- **Datos del Emisor**: Empresa, contacto, cargo, email, teléfono
- **Datos del Receptor**: Empresa cliente, contacto, cargo, email
- **Contexto Inteligente**: Tipo de cliente y sector de mercado
- **Asunto Personalizado**: Motivo específico de la propuesta

### 2. **Sistema de Logos**
- **Logos del Emisor**: Sube y almacena logos de tu empresa
- **Logos de Cliente**: Opcional, para dar imagen más profesional
- **Formatos Soportados**: PNG, JPG, SVG
- **Gestión Centralizada**: Reutiliza logos guardados previamente
- **Límite de Tamaño**: 2MB máximo por logo

### 3. **Introducción Inteligente**
- **Templates por Sector**: Introducción adaptada al tipo de industria
- **Personalización IA**: Opcionalmente usa OpenAI GPT para generar introducciones únicas
- **Tono Profesional**: Formal y adecuado para propuestas comerciales

### 4. **Gestión de IVA**
- **IVA Desglosado**: Muestra subtotal + IVA (16%) = Total
- **IVA Integrado**: Muestra total con IVA incluido
- **Tasa Configurable**: Ajustable según jurisdicción
- **Indicador Visual**: Claramente marcado si está incluido o separado

### 5. **Contenido NO Incluido (Confidencial)**
❌ **NO se muestra al cliente:**
- Costos unitarios
- Márgenes de ganancia
- Tipos de cambio internos
- Información financiera interna

✅ **SÍ se muestra al cliente:**
- Descripción de productos/servicios
- Cantidad
- Precio unitario final
- Subtotal por línea
- Totales con IVA

### 6. **Términos y Condiciones**
- **Template Pre-Configurado**: Incluye condiciones estándar
- **Totalmente Editable**: Personaliza según tu negocio
- **Secciones Incluidas**:
  - Vigencia de propuesta
  - Forma de pago
  - Tiempo de entrega
  - Garantía
  - Alcance
  - Aceptación
  - Confidencialidad

### 7. **Firma Digital**
- Nombre de quien firma
- Cargo
- Empresa
- Espacio para firma (opcional: imagen)

### 8. **Generación de PDF**
- **Diseño Profesional**: Template HTML/CSS optimizado
- **Paginación Automática**: Maneja propuestas de múltiples páginas
- **Numeración**: Página X de Y automática
- **Header/Footer**: Información en encabezado y pie de página

---

## 🏗️ Arquitectura Técnica

### **Base de Datos**

#### Tabla: `company_logos`
Almacena logos reutilizables de empresas y clientes.

```sql
CREATE TABLE company_logos (
    logo_id TEXT PRIMARY KEY,
    logo_name TEXT NOT NULL,
    logo_type TEXT NOT NULL,  -- 'issuer' o 'client'
    company_name TEXT,
    logo_data BYTEA NOT NULL,  -- Datos binarios del logo
    logo_format TEXT NOT NULL, -- png, jpg, svg
    uploaded_at TIMESTAMP NOT NULL,
    is_default BOOLEAN DEFAULT FALSE
);
```

#### Tabla: `formal_proposals`
Almacena propuestas generadas completas.

```sql
CREATE TABLE formal_proposals (
    proposal_doc_id TEXT PRIMARY KEY,
    quote_id TEXT REFERENCES quotes(quote_id),
    proposal_id TEXT REFERENCES proposals(proposal_id),
    
    -- Numeración
    proposal_number TEXT UNIQUE NOT NULL,  -- PROP-2026-0001
    issued_date DATE NOT NULL,
    valid_until DATE,
    
    -- Emisor
    issuer_company TEXT NOT NULL,
    issuer_contact_name TEXT,
    issuer_contact_title TEXT,
    issuer_email TEXT,
    issuer_phone TEXT,
    
    -- Receptor
    recipient_company TEXT NOT NULL,
    recipient_contact_name TEXT,
    recipient_contact_title TEXT,
    recipient_email TEXT,
    
    -- Contexto
    client_type TEXT,
    market_sector TEXT,
    subject TEXT,
    custom_intro TEXT,
    
    -- Logos
    issuer_logo_id TEXT REFERENCES company_logos(logo_id),
    client_logo_id TEXT REFERENCES company_logos(logo_id),
    
    -- Condiciones
    terms_and_conditions TEXT,
    
    -- Firma
    signature_name TEXT,
    signature_title TEXT,
    signature_image_data BYTEA,
    
    -- IVA
    iva_rate NUMERIC DEFAULT 0.16,
    iva_included BOOLEAN DEFAULT FALSE,
    
    -- PDF
    total_pages INTEGER,
    pdf_file_data BYTEA,
    
    -- Estado
    status TEXT DEFAULT 'draft',
    sent_at TIMESTAMP,
    
    -- Auditoría
    created_by TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP
);
```

### **Módulos de Código**

#### `formal_proposal_generator.py`
Módulo principal de generación:

- `generate_proposal_number()` - Genera número único (PROP-YYYY-XXXX)
- `generate_intro_text()` - Crea introducción personalizada
- `generate_intro_with_ai()` - Usa OpenAI para introducción más elaborada
- `calculate_totals()` - Calcula subtotales, IVA y total
- `logo_to_base64()` - Convierte logos a formato embebible en HTML
- `process_logo_upload()` - Procesa archivos de logo subidos
- `generate_proposal_pdf()` - Genera PDF final usando WeasyPrint
- `create_formal_proposal()` - Función principal de creación

#### `database.py` (funciones agregadas)
- `save_logo()` - Guarda logo en BD
- `get_logos()` - Lista logos disponibles
- `get_logo_data()` - Obtiene datos binarios de un logo
- `save_formal_proposal()` - Guarda propuesta completa
- `get_formal_proposals()` - Lista propuestas
- `get_formal_proposal()` - Obtiene propuesta específica

#### `templates/proposal/proposal_template.html`
Template HTML profesional con:
- CSS moderno y responsive
- Diseño de 2 columnas para metadata
- Tabla de items con hover effects
- Sección destacada de totales
- Diseño visual para términos y condiciones
- Footer con información de página

---

## 🚀 Uso del Sistema

### **Paso 1: Acceder a la Pestaña**
En la aplicación Streamlit, ir a **"📄 Propuestas Formales"**

### **Paso 2: Seleccionar Origen**
- Elegir entre "Cotización Legacy" o "Propuesta AUP"
- Seleccionar la cotización específica

### **Paso 3: Configurar Datos**

#### 🏢 Datos del Emisor
```
Empresa: Tu Empresa S.A. de C.V.
Contacto: Juan Pérez
Cargo: Director Comercial
Email: ventas@tuempresa.com
Teléfono: +52 55 1234 5678
```

#### 👤 Datos del Cliente
```
Empresa: Cliente Corp. S.A.
Contacto: María González
Cargo: Gerente de Compras
Email: compras@cliente.com
```

#### 🎯 Contexto
- **Tipo de Cliente**: Corporativo, PyME, Gobierno, etc.
- **Sector de Mercado**: Tecnología, Construcción, Servicios, etc.
- **Asunto**: "Propuesta de infraestructura TI"

### **Paso 4: Configurar Visuales**

#### 🎨 Logos
- Seleccionar logo existente o subir nuevo
- Logo de cliente es opcional pero mejora presentación

#### 💰 IVA
- Tasa: 16% (México)
- Modo: Desglosado o Integrado

### **Paso 5: Personalizar Contenido**

#### 📋 Términos y Condiciones
Editar el texto preestablecido según necesidades

#### ✍️ Firma
```
Nombre: Juan Pérez
Cargo: Director Comercial
```

### **Paso 6: Generar**
1. Click en **"🎯 Generar Propuesta Formal"**
2. Sistema genera PDF automáticamente
3. Descargar PDF generado
4. Propuesta queda guardada en historial

---

## 📊 Ejemplo de Flujo

```
Usuario → Selecciona Cotización Q-123
       → Configura datos de emisor/receptor
       → Sube logo de empresa
       → Configura IVA desglosado al 16%
       → Genera propuesta
       ↓
Sistema → Genera número PROP-2026-0001
       → Crea introducción personalizada
       → Calcula totales con IVA
       → Renderiza HTML con datos
       → Genera PDF con WeasyPrint
       → Guarda en BD
       ↓
Usuario → Descarga PDF
       → Envía a cliente por email
```

---

## 🔧 Configuración Inicial

### **Migración de Base de Datos**
```bash
python migrate_add_formal_proposals.py
```

### **Dependencias**
Ya incluidas en `requirements.txt`:
- `weasyprint` - Generación de PDF
- `jinja2` - Templates HTML
- `Pillow` - Procesamiento de imágenes

### **Crear Logo Default**
```python
import uuid
from database import save_logo

svg_logo = '''<svg width="200" height="80" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="80" fill="#2c3e50"/>
  <text x="100" y="45" font-family="Arial" font-size="24" 
        fill="white" text-anchor="middle" font-weight="bold">
    Tu Empresa
  </text>
</svg>'''

logo_id = str(uuid.uuid4())
save_logo(
    logo_id,
    'Logo Default',
    'issuer',
    'Tu Empresa',
    svg_logo.encode('utf-8'),
    'svg',
    is_default=True
)
```

---

## 🎨 Personalización Avanzada

### **Cambiar Template HTML**
Editar: `templates/proposal/proposal_template.html`

### **Modificar Estilos**
Buscar la sección `<style>` en el template HTML y ajustar:
- Colores corporativos
- Tipografía
- Espaciados
- Diseño de tabla

### **Agregar Nuevos Campos**
1. Modificar tabla `formal_proposals` en migración
2. Actualizar función `create_formal_proposal()`
3. Agregar campos en UI de Streamlit
4. Actualizar template HTML

---

## 📈 Próximas Mejoras

### **Corto Plazo**
- ✅ Integración con Motor AUP (ya preparada estructura)
- ✅ Envío automático por correo electrónico
- ✅ Tracking de propuestas (vistas, aceptadas)

### **Mediano Plazo**
- ⭐ Firma electrónica integrada
- ⭐ Versionado de propuestas
- ⭐ Comparación de propuestas enviadas
- ⭐ Multi-idioma (español/inglés)
- ⭐ Plantillas prediseñadas de industria

### **Largo Plazo**
- 🚀 Portal de cliente para aceptación online
- 🚀 Integración con CRM
- 🚀 Analytics de propuestas
- 🚀 Workflow de aprobación interna

---

## 🛠️ Troubleshooting

### **Error: WeasyPrint no disponible**
```bash
# Linux/Ubuntu
sudo apt-get install python3-dev python3-cffi libcairo2 libpango-1.0-0
pip install weasyprint

# Mac
brew install cairo pango gdk-pixbuf libffi
pip install weasyprint
```

### **Error: Logo no se muestra en PDF**
- Verificar que el formato sea compatible (PNG, JPG, SVG)
- Verificar tamaño < 2MB
- Revisar que logo_id esté correctamente guardado

### **Error: Introducción vacía**
- Verificar que todos los campos requeridos estén llenos
- Probar con template estándar (sin IA)

### **PDF se genera pero no descarga**
- Verificar que `pdf_file_data` no sea NULL en BD
- Revisar permisos de escritura
- Verificar memoria disponible

---

## 📞 Soporte

Para más información o reportar issues:
- Revisar logs de Streamlit
- Verificar conexión a base de datos
- Consultar TROUBLESHOOTING.md general

---

**Última actualización:** 2026-02-02  
**Versión del sistema:** 1.0.0  
**Autor:** DynamiQuote Team
