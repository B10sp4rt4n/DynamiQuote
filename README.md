# 🧾 DynamiQuote - Cotizador Universal MVP

Sistema de cotización inteligente con corrección automática de texto, análisis de márgenes y visualización de datos.

## Características

- ✅ Gestión de líneas de cotización (productos/servicios)
- 🔍 Corrección automática de ortografía en español
- 📊 Análisis financiero con métricas clave
- 📈 Visualizaciones de aportación por componente
- 💾 Persistencia en SQLite
- 🎯 Estrategias de pricing (penetración, defensa, upsell, renovación)

## Instalación

```bash
# Instalar dependencias
pip install -r requirements.txt

# Ejecutar la aplicación
streamlit run app.py
```

## Uso

1. Completa el formulario con SKU, descripción, costos y precios
2. El sistema sugerirá correcciones ortográficas automáticamente
3. Define márgenes objetivo o precios directos
4. Visualiza métricas financieras en tiempo real
5. Guarda la propuesta al finalizar

## Tecnologías

- **Streamlit** - Interfaz web interactiva
- **SQLite** - Base de datos embebida
- **Pandas** - Análisis de datos
- **Matplotlib** - Visualizaciones
- **PySpellChecker** - Corrección ortográfica

## Base de datos

La aplicación crea automáticamente `quotes_mvp.db` con dos tablas:
- `quotes` - Encabezados de cotizaciones
- `quote_lines` - Líneas de detalle

## Licencia

MIT
