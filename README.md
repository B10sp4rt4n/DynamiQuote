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
- `quote_lines` - Líneas de detalle (con sistema de cantidad y recálculo automático)

## Características Avanzadas

### Sistema de Cantidad y Cálculo Automático
Cada línea de cotización es un nodo con atributos que se recalculan automáticamente:
- **Cantidad**: Número de unidades
- **Precio unitario**: Precio por unidad
- **Costo unitario**: Costo por unidad
- **Margen %**: Porcentaje de margen bruto

Cuando cambias cualquier atributo, los demás se ajustan automáticamente. Ver [QUANTITY_SYSTEM.md](QUANTITY_SYSTEM.md) para detalles completos.

## Estructura del Proyecto

```
DynamiQuote/
├── app.py                      # Aplicación principal
├── database.py                 # Capa de abstracción de BD
├── line_calculations.py        # Cálculos automáticos de líneas
├── excel_import.py             # Importación desde Excel
├── migrate_to_neon.py          # Script de migración a Neon
├── migrate_add_quantity.py     # Script para agregar campo cantidad
├── requirements.txt            # Dependencias
├── .env.example                # Ejemplo de configuración
├── CODE_REVIEW.md              # Análisis de código
├── QUANTITY_SYSTEM.md          # Documentación del sistema de cantidad
├── VERSIONING_SYSTEM.md        # Documentación del sistema de versiones
└── POTENTIAL_ANALYSIS.md       # Análisis de mercado
```

## Deploy en Producción

### Streamlit Cloud
```bash
# Push tu código a GitHub
git push origin main

# En Streamlit Cloud:
# 1. Conecta tu repo
# 2. Agrega DATABASE_URL en secrets
# 3. Deploy automático
```

### Railway / Render
```bash
# Agregar Procfile:
web: streamlit run app.py --server.port=$PORT --server.address=0.0.0.0
```

## Licencia

MIT
