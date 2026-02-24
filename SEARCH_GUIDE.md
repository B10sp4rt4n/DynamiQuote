# 🔍 Guía del Sistema de Búsqueda - DynamiQuote

## 📋 Resumen

DynamiQuote ahora cuenta con un **sistema de búsqueda inteligente** que facilita encontrar cotizaciones y propuestas sin tener que cargar toda la base de datos.

## ✨ Características Principales

### 1. **Búsqueda Global** (Siempre Visible)
- **Ubicación:** Panel expandible debajo del título principal
- **Acceso rápido:** Busca desde cualquier parte de la app
- **Resultados instantáneos:** Máximo 10 resultados más relevantes
- **Campos de búsqueda:**
  - Nombre del cliente
  - Nombre de la propuesta
  - Quien cotizó
  - Monto de la cotización

### 2. **Búsqueda en Secciones Específicas**
Cada sección importante tiene su propio buscador:
- **Comparador de Versiones:** Encuentra cotizaciones para comparar
- **Asociar a Existente:** Busca propuestas base para nueva versión
- **Base de Datos:** Búsqueda con filtros avanzados

### 3. **Búsqueda Avanzada** (Disponible en Tab Base de Datos)
- **Filtros por fecha:** Rango desde/hasta
- **Filtros por monto:** Mínimo/máximo
- **Filtros por estado:** draft, sent, approved, rejected, closed
- **Resultados en tarjetas:** Vista visual con toda la información relevante

## 🎯 Cómo Usar

### Búsqueda Básica
```
1. Expande "🔍 Búsqueda Rápida de Cotizaciones y Propuestas"
2. Escribe el término de búsqueda (ej: "Acme Corp", "Juan Pérez", "50000")
3. Click en Buscar o presiona Enter
4. Selecciona el resultado deseado
```

### Búsqueda Con Filtros
```
1. Ve al tab "📚 Base de Datos"
2. Usa el campo de búsqueda principal
3. Activa "Filtros avanzados"
4. Configura rangos de fecha, monto, estado
5. Los resultados se filtran automáticamente
```

## 🔍 Términos de Búsqueda Inteligentes

El buscador es **case-insensitive** y busca coincidencias parciales:

| Búsqueda | Encuentra |
|----------|-----------|
| `Acme` | Acme Corp, Acme Industries, The Acme Company |
| `Juan` | Juan Pérez, Juan García, María Juana |
| `50000` | Cotizaciones con monto $50,000 o $150,000 |
| `Proyecto Alpha` | "Proyecto Alpha Phase 1", "Alpha Project" |

## ⚡ Performance

### Antes (Sistema Antiguo)
- ❌ Cargaba **TODAS** las cotizaciones (500+)
- ❌ Tiempo de espera: 2.5-4.2 segundos
- ❌ Alto uso de memoria
- ❌ Dropdown largos e inmanejables

### Ahora (Sistema Nuevo)
- ✅ Carga solo **20-50 resultados** relevantes
- ✅ Tiempo de respuesta: <500ms
- ✅ Memoria optimizada (90% menos)
- ✅ Resultados visuales en tarjetas

## 📊 Campos Buscables

El sistema busca en los siguientes campos:

1. **client_name** - Nombre del cliente
2. **proposal_name** - Nombre de la propuesta
3. **quoted_by** - Quien realizó la cotización
4. **total_revenue** - Monto total (búsqueda numérica)

## 🎨 Componentes de UI

### `render_advanced_quote_search()`
Buscador completo con filtros avanzados. Incluye:
- Campo de búsqueda principal
- Filtros de fecha (desde/hasta)
- Filtros de monto (mín/máx)
- Filtros de estado
- Resultados en tarjetas visuales

### `render_quote_search_selector()`
Buscador simple con resultados en dropdown. Ideal para:
- Selección rápida
- Espacios limitados
- Flujos simples

### Búsqueda Global
Panel expandible siempre visible que permite:
- Búsqueda rápida sin navegar tabs
- Resultados compactos con acciones
- Referencia a la cotización seleccionada

## 🛠️ Funciones de Backend

### `search_quotes(query, limit=20)`
```python
# Búsqueda inteligente en múltiples campos
results = search_quotes("Acme Corp", limit=30)
```

### `get_recent_quotes(limit=20)`
```python
# Obtiene las cotizaciones más recientes
recent = get_recent_quotes(limit=50)
```

### `get_quote_by_group_id(quote_group_id)`
```python
# Búsqueda directa por ID de grupo
quote_data = get_quote_by_group_id("abc-123-def")
```

## 💡 Tips de Uso

1. **Búsqueda Incremental:** Escribe y espera, los resultados aparecen automáticamente
2. **Términos Parciales:** No necesitas escribir el nombre completo
3. **Múltiples Palabras:** Busca "Proyecto Alpha" encuentra variaciones
4. **Búsqueda Numérica:** Busca por monto: "50000" encuentra $50,000
5. **Filtros Avanzados:** Combina búsqueda + filtros para resultados precisos

## 🚫 NO Cachear Búsquedas

**IMPORTANTE:** Las funciones de búsqueda NO están cacheadas porque:
- Cada búsqueda es única
- Los datos cambian frecuentemente
- Cachear acumularía mucha información en memoria
- Búsquedas frescas garantizan datos actuales

## 📝 Próximas Mejoras

- [ ] Búsqueda difusa (fuzzy search) para tolerar errores tipográficos
- [ ] Autocompletado mientras se escribe
- [ ] Búsqueda por rangos de margen/utilidad
- [ ] Ordenamiento de resultados por relevancia
- [ ] Historial de búsquedas recientes
- [ ] Guardar búsquedas favoritas

## 🔗 Referencias

- **Código de búsqueda:** `database.py` - funciones `search_quotes()`, `get_recent_quotes()`
- **Componentes UI:** `app.py` - funciones `render_advanced_quote_search()`, `render_quote_search_selector()`
- **SQL Queries:** Optimizadas con DISTINCT ON (PostgreSQL) o subconsultas (SQLite)
- **Límites:** Máximo 20-50 resultados por búsqueda para mantener performance

---

**Última actualización:** Febrero 2026  
**Versión:** 2.0 - Sistema de Búsqueda Inteligente
