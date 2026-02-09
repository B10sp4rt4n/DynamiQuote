<!--
# WARNING:
# - DO NOT update closed records
# - DO NOT calculate totals outside integrated nodes
# - DO NOT infer values not explicitly derived
# - DO NOT merge proposal versions
# - DO NOT bypass tenant isolation
-->

# 🧾 DynamiQuote - Cotizador Universal MVP

Sistema de cotización inteligente con corrección automática de texto, análisis de márgenes y visualización de datos.

## Características

- ✅ Gestión de líneas de cotización (productos/servicios)
- 🔍 Corrección automática de ortografía en español
- 📊 Análisis financiero con métricas clave
- 📈 Visualizaciones de aportación por componente
- 💾 Persistencia en SQLite o PostgreSQL (Neon)
- 🎯 Estrategias de pricing (penetración, defensa, upsell, renovación)
- ☁️ Soporte cloud-native con Neon PostgreSQL

## Instalación

```bash
# Instalar dependencias
pip install -r requirements.txt

# Configurar base de datos (opcional - usa SQLite por defecto)
cp .env.example .env
# Edita .env con tu Neon DATABASE_URL

# Ejecutar la aplicación
streamlit run app.py
```

## Configuración de Base de Datos

### Opción 1: SQLite (Por defecto - Sin configuración)
No requiere configuración. La aplicación creará automáticamente `quotes_mvp.db`.

### Opción 2: PostgreSQL con Neon (Recomendado para producción)

1. **Crear cuenta en Neon:** https://neon.tech
2. **Crear proyecto y obtener connection string**
3. **Configurar variables de entorno:**
   ```bash
   cp .env.example .env
   # Editar .env y agregar:
   DATABASE_URL=postgresql://user:password@ep-xxxxx.region.aws.neon.tech/dbname?sslmode=require
   ```

4. **Migrar datos existentes (opcional):**
   ```bash
   python migrate_to_neon.py
   ```

### Ventajas de Neon PostgreSQL
- ☁️ Serverless y auto-scaling
- 🔐 Seguridad enterprise (SSL, roles)
- 💾 Backups automáticos
- 🌐 Multi-usuario real
- 🚀 Production-ready
- 💰 Free tier: 512MB storage

## Uso

1. Completa el formulario con SKU, descripción, costos y precios
2. El sistema sugerirá correcciones ortográficas automáticamente
3. Define márgenes objetivo o precios directos
4. Visualiza métricas financieras en tiempo real
5. Guarda la propuesta al finalizar

## Tecnologías

- **Streamlit** - Interfaz web interactiva
- **PostgreSQL/SQLite** - Base de datos flexible
- **Neon** - PostgreSQL serverless (opcional)
- **Pandas** - Análisis de datos
- **Matplotlib** - Visualizaciones
- **PySpellChecker** - Corrección ortográfica

## Base de datos

La aplicación crea automáticamente dos tablas:
- `quotes` - Encabezados de cotizaciones
- `quote_lines` - Líneas de detalle

## Estructura del Proyecto

```
DynamiQuote/
├── app.py                  # Aplicación principal
├── database.py             # Capa de abstracción de BD
├── migrate_to_neon.py      # Script de migración
├── requirements.txt        # Dependencias
├── .env.example            # Ejemplo de configuración
├── CODE_REVIEW.md          # Análisis de código
└── POTENTIAL_ANALYSIS.md   # Análisis de mercado
```

## Deploy en Producción

### Streamlit Cloud (Recomendado)

La aplicación está configurada para funcionar en Streamlit Community Cloud:

```bash
# 1. Push tu código a GitHub
git push origin main

# 2. En Streamlit Cloud (share.streamlit.io):
#    - Conecta tu repositorio GitHub
#    - Selecciona la rama (main o feature/api-first-validation)
#    - El archivo debe ser: app.py
#    - Configura los secrets en Settings > Secrets:

DATABASE_URL = "postgresql://user:password@ep-xxxxx.region.aws.neon.tech/dbname?sslmode=require"
# Opcional: OPENAI_API_KEY para corrección inteligente

# 3. Deploy automático
```

**Características disponibles en Streamlit Cloud:**
- ✅ Cotizador completo con corrección ortográfica
- ✅ Análisis financiero y visualizaciones  
- ✅ Base de datos PostgreSQL (Neon)
- ✅ Importación de Excel
- ✅ Propuestas formales
- ⚠️ Generación PDF (limitada - ver nota abajo)

**Nota sobre PDFs:** WeasyPrint requiere dependencias del sistema (cairo, pango) que pueden no estar disponibles en Streamlit Community Cloud. La app funcionará completamente sin PDFs. Para soporte completo de PDF, usa Docker o deploy local.

**Archivos de configuración:**
- `requirements.txt` - Dependencias Python (WeasyPrint es opcional)
- `packages.txt` - Paquetes del sistema para WeasyPrint (intentará instalar)
- `.streamlit/config.toml` - Configuración UI y tema

### Docker (Para soporte completo de PDF)

```dockerfile
FROM python:3.11-slim

# Instalar dependencias del sistema para WeasyPrint
RUN apt-get update && apt-get install -y \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .

# Instalar WeasyPrint en Docker
RUN pip install weasyprint>=68.0
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8501
CMD ["streamlit", "run", "app.py", "--server.port=8501", "--server.address=0.0.0.0"]
```

### Railway / Render
```bash
# Agregar Procfile:
web: streamlit run app.py --server.port=$PORT --server.address=0.0.0.0
```

## Licencia

MIT
