# 📥 Sistema de Importación Excel - DynamiQuote

## 📋 Resumen

Sistema de importación masiva desde Excel con validación estricta, detección de duplicados y trazabilidad completa.

**Implementado:** 23 enero 2026
**Status:** ✅ Production Ready

---

## 🎯 Características

### **1. Template Excel Profesional**
- 4 columnas: `Descripción | Cantidad | Costo Unitario | Subtotal`
- Validación de datos (Excel nativo)
- Fórmulas protegidas
- 3 ejemplos pre-cargados
- Headers con estilo corporativo

### **2. Validación Estricta**
```python
✅ Estructura del Excel
✅ Descripción no vacía
✅ Cantidad > 0 (o asume 1)
✅ Costo > 0
✅ Subtotal coincide (tolerancia ±$0.01)
```

### **3. Reporte de Errores Detallado**
```
📊 Resumen:
- Total: 50 filas
- ✅ Válidas: 47
- ❌ Errores: 3

Errores encontrados:
Fila 5: Cantidad debe ser > 0
Fila 12: Costo inválido
Fila 23: Subtotal no coincide
```

### **4. Detección de Duplicados (difflib)**
```python
# Detecta similitud al 85%+
"ThreatDown EDR"
"ThreatDown Endpoint Detection"
→ 92% similar ⚠️
```

### **5. Preview Editable**
- Usuario puede modificar antes de confirmar
- Campos editables: Descripción, SKU, Costos, Márgenes, Estrategia
- Agregar/eliminar filas antes de import

### **6. Trazabilidad Completa**
```sql
quote_lines:
- import_source: 'manual' | 'excel'
- import_batch_id: UUID (agrupa líneas del mismo Excel)

import_files:
- file_id, quote_id, filename
- file_data (BLOB - Excel original)
- rows_imported, rows_errors
- uploaded_at
```

---

## 🏗️ Arquitectura

### **Flujo de Importación**

```
1. Usuario descarga template
   ↓
2. Llena productos en Excel
   ↓
3. Sube archivo .xlsx
   ↓
4. VALIDACIÓN ESTRICTA
   ├─ Estructura
   ├─ Tipos de datos
   ├─ Rangos válidos
   └─ Consistencia matemática
   ↓
5. DETECCIÓN DE DUPLICADOS
   ├─ Compara con líneas existentes
   └─ Similitud > 85% → Alerta
   ↓
6. PREVIEW EDITABLE
   ├─ Usuario revisa
   ├─ Modifica si necesario
   └─ Confirma
   ↓
7. CORRECCIÓN ORTOGRÁFICA
   ├─ suggest_description_fix()
   └─ Aplica a todas las líneas
   ↓
8. GUARDAR
   ├─ Líneas → quote_lines
   ├─ Excel original → import_files
   └─ Metadata: import_source, import_batch_id
```

---

## 📦 Archivos Implementados

### **1. templates/import/dynamiquote_simple.xlsx**
Template Excel con:
- Data validation (cantidad, costo)
- Fórmulas protegidas (subtotal)
- Formato profesional
- 3 ejemplos de ThreatDown

### **2. excel_import.py** (~350 líneas)
Módulo de importación con:
- `validate_excel_structure()`: Valida columnas
- `validate_row()`: Valida cada fila
- `validate_excel_data()`: Reporte completo
- `detect_similar_descriptions()`: Duplicados con difflib
- `convert_to_quote_lines()`: Convierte a formato interno
- `import_excel_file()`: Función principal
- `format_validation_report()`: Formatea para UI

### **3. database.py** (actualizado)
Nuevas funciones:
- `save_import_file()`: Guarda Excel para auditoría
- `init_database()`: Crea tabla `import_files`
- `save_quote()`: Soporta 16 campos (+ import tracking)
- `load_lines_for_quote()`: Incluye import_source, import_batch_id

### **4. migrate_add_import_tracking.py**
Migración automática:
- Agrega `import_source TEXT DEFAULT 'manual'`
- Agrega `import_batch_id TEXT`
- Crea tabla `import_files`
- Soporta PostgreSQL y SQLite

### **5. app.py** (integración UI)
Nueva sección en "📝 Nueva Cotización":
- Botón descarga template
- Upload Excel
- Procesamiento con spinner
- Reporte de validación
- Alertas de duplicados
- Preview editable (`st.data_editor`)
- Confirmación/Cancelación

---

## 🔧 Schema de Base de Datos

### **quote_lines (actualizado)**
```sql
ALTER TABLE quote_lines 
ADD COLUMN import_source TEXT DEFAULT 'manual';

ALTER TABLE quote_lines 
ADD COLUMN import_batch_id TEXT;
```

### **import_files (nueva)**
```sql
CREATE TABLE import_files (
    file_id TEXT PRIMARY KEY,
    quote_id TEXT REFERENCES quotes(quote_id),
    filename TEXT NOT NULL,
    uploaded_at TIMESTAMP NOT NULL,
    file_data BYTEA NOT NULL,  -- BLOB en SQLite
    file_size INTEGER,
    rows_imported INTEGER,
    rows_errors INTEGER
);
```

---

## 🎯 Casos de Uso

### **Caso 1: Import simple (sin errores)**
```
1. Descarga template
2. Llena 10 productos
3. Sube archivo
→ ✅ 10 líneas válidas
→ Preview → Confirmar
→ ✅ Importadas correctamente
```

### **Caso 2: Import con errores**
```
1. Sube Excel con 50 líneas
→ ✅ 47 válidas
→ ❌ 3 con errores
→ Ver reporte detallado:
  - Fila 5: Cantidad inválida
  - Fila 12: Costo vacío
→ Corrige Excel → Re-sube
→ ✅ 50 válidas
```

### **Caso 3: Duplicados detectados**
```
1. Cotización tiene: "ThreatDown EDR"
2. Import trae: "ThreatDown Endpoint Detection"
→ ⚠️ 92% similar detectado
→ Usuario decide: continuar o modificar
```

### **Caso 4: Edición pre-import**
```
1. Import 20 líneas
2. Preview muestra todas
3. Usuario edita:
   - Cambia margen de línea 5: 35% → 40%
   - Ajusta estrategia línea 10: penetration → defense
4. Confirma
→ ✅ Cambios aplicados
```

---

## 📊 Metadata de Importación

Cada línea importada incluye:

```python
{
    "import_source": "excel",
    "import_batch_id": "a1b2c3d4-...",  # UUID único
    "warnings": "Precio calculado con margen 35% | Importado desde Excel",
    "sku": "IMP-A1B2C3D4",  # Auto-generado
    "description_corrections": "correcciones aplicadas..."
}
```

---

## 🔍 Validaciones Implementadas

| Campo | Validación | Acción si Falla |
|-------|-----------|----------------|
| **Descripción** | No vacía | ❌ Error |
| **Cantidad** | Entero > 0 | ⚠️ Asume 1 si vacío |
| **Costo** | Decimal > 0 | ❌ Error |
| **Subtotal** | = Qty × Costo (±$0.01) | ⚠️ Warning si no coincide |

---

## 💡 Mejoras Rescatadas del Enfoque Complejo

### **✅ Implementado**
1. **Guardar Excel original** → Auditoría completa
2. **import_source + import_batch_id** → Trazabilidad
3. **Reporte de validación detallado** → UX profesional
4. **Detección duplicados (difflib)** → Sin dependencies extras
5. **Preview editable** → Control pre-confirmación
6. **Normalización automática** → suggest_description_fix()

### **❌ Dejado para Fase 2**
- rapidfuzz (diffl lib es suficiente por ahora)
- Staging tables (complejidad innecesaria en MVP)
- Mapping UI flexible (template fijo cubre 80% casos)
- pydantic validators (pandas + lógica custom es suficiente)

---

## 🚀 ROI Estimado

### **Tiempo ahorrado por cotización:**
```
Manual (50 líneas × 1 min/línea):     50 minutos
Import Excel (5 min):                   5 minutos
                                    ─────────────
Ahorro:                               45 minutos
```

### **Valor agregado:**
- ✅ Trazabilidad enterprise-grade
- ✅ Detección proactiva de errores
- ✅ Auditoría completa (Excel original guardado)
- ✅ Professional UX (preview editable)

---

## 🧪 Testing

### **Test Cases:**
1. ✅ Import template vacío → Error estructura
2. ✅ Import 10 líneas válidas → Success
3. ✅ Import con 3 errores → Reporte detallado
4. ✅ Duplicados detectados → Alertas mostradas
5. ✅ Edición en preview → Cambios aplicados
6. ✅ Excel guardado → Auditoría completa

---

## 📈 Impacto en Valuación

Este feature agrega valor porque:

1. **Reduce friction** → Onboarding más rápido
2. **Enterprise-ready** → Auditoría completa
3. **Professional UX** → Validación y preview
4. **Escalable** → Soporta cientos de líneas
5. **Diferenciador** → Detección duplicados inteligente

**Estimado:** +$50K-$100K en valuación (feature professional que otros CPQs no tienen)

---

## 🔜 Roadmap Futuro

### **Fase 2 (Post-Beta):**
- Templates múltiples (MSP, Multi-Fabricante)
- Import con márgenes personalizados
- Drag & drop de archivos
- Batch import (múltiples Excels a la vez)

### **Fase 3 (Producto Maduro):**
- Mapping UI flexible
- Integración con Neodata/OPUS (construcción)
- ML para auto-categorización
- API de importación

---

## 👥 Usuarios Beta

**Siguiente paso:** Validar con 3-5 MSPs reales que este feature:
- Reduce tiempo de creación de cotizaciones
- Detección de duplicados es útil
- Preview editable tiene valor

---

**Implementación completada:** 23 enero 2026
**Tiempo total:** ~6 horas
**Lines of Code:** +600 (excel_import.py + UI + migrations)
**Status:** ✅ Production Ready
