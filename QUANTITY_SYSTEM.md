# 📊 Sistema de Cantidad y Cálculo Automático - DynamiQuote

## 📋 Resumen

Implementación del sistema de nodos para líneas de cotización con recálculo automático de atributos. Cada línea ahora es un nodo con cuatro atributos principales que se recalculan automáticamente cuando alguno cambia.

---

## 🎯 Atributos de Línea (Nodo)

Cada línea de cotización ahora tiene los siguientes atributos:

| Atributo | Descripción | Ejemplo |
|----------|-------------|---------|
| `price_unit` | Precio unitario | $100 |
| `cost_unit` | Costo unitario | $60 |
| `margin_pct` | Margen bruto porcentual | 40% |
| `quantity` | Cantidad de unidades | 2 |

### Valores Calculados Automáticamente

| Campo | Fórmula | Ejemplo |
|-------|---------|---------|
| `total_price` | `price_unit × quantity` | $100 × 2 = $200 |
| `total_cost` | `cost_unit × quantity` | $60 × 2 = $120 |
| `total_margin_pct` | Igual a `margin_pct` | 40% |

---

## 🔄 Lógica de Recálculo Automático

### Relaciones Matemáticas

```
margin_pct = ((price_unit - cost_unit) / price_unit) × 100
price_unit = cost_unit / (1 - margin_pct / 100)
cost_unit = price_unit × (1 - margin_pct / 100)
```

### Ejemplos de Recálculo

#### Ejemplo 1: Cambiar Precio
**Entrada:**
- Precio: 100 → 120
- Costo: 80 (constante)
- Cantidad: 2

**Resultado Automático:**
- Margen: 20% → 33.33%
- Total Precio: 200 → 240
- Total Costo: 160 (sin cambio)

#### Ejemplo 2: Cambiar Margen
**Entrada:**
- Precio: 100 (constante)
- Margen: 20% → 40%
- Cantidad: 1

**Resultado Automático:**
- Costo: 80 → 60
- Total Precio: 100 (sin cambio)
- Total Costo: 80 → 60

#### Ejemplo 3: Cambiar Cantidad
**Entrada:**
- Precio: 100 (constante)
- Costo: 80 (constante)
- Margen: 20% (constante)
- Cantidad: 1 → 5

**Resultado Automático:**
- Total Precio: 100 → 500
- Total Costo: 80 → 400
- Margen %: 20% (sin cambio)

---

## 🆕 Cambios en la Interfaz

### Formulario de Agregar Línea

```
┌─────────────────────────────────────┐
│ SKU *: PROD-001                     │
│ Descripción *: Laptop Dell          │
│ Tipo: product                       │
├─────────────────────────────────────┤
│ Origen: producto                    │
│ Costo unitario: 60.00               │
│ Precio unitario: 100.00             │
├─────────────────────────────────────┤
│ Cantidad: 2              ← NUEVO    │
│ Margen objetivo %: 40                │
│ Estrategia: upsell                  │
└─────────────────────────────────────┘
```

### Tabla de Cotización

La tabla ahora muestra:
- **Cantidad**: Unidades de cada línea
- **Costo Unit.**: Costo por unidad
- **Precio Unit.**: Precio por unidad
- **Margen %**: Margen porcentual
- **Total Costo**: Costo total de la línea
- **Total Precio**: Precio total de la línea

### Métricas Principales

Las métricas ahora reflejan los **totales** considerando cantidad:
- **Ingreso Total**: Suma de `total_price` de todas las líneas
- **Costo Total**: Suma de `total_cost` de todas las líneas
- **Utilidad Bruta**: Ingreso Total - Costo Total
- **Margen Bruto %**: (Utilidad Bruta / Ingreso Total) × 100

---

## 🗄️ Cambios en Base de Datos

### Nueva Columna

```sql
ALTER TABLE quote_lines 
ADD COLUMN quantity INTEGER DEFAULT 1;
```

### Campos Actualizados

**Antes (16 campos):**
```
line_id, quote_id, sku, description_original, description_final,
description_corrections, line_type, service_origin, cost_unit,
final_price_unit, margin_pct, strategy, warnings, created_at,
import_source, import_batch_id
```

**Después (17 campos):**
```
line_id, quote_id, sku, description_original, description_final,
description_corrections, line_type, service_origin, cost_unit,
final_price_unit, margin_pct, quantity, strategy, warnings, created_at,
import_source, import_batch_id
```

---

## 📦 Importación desde Excel

El sistema de importación Excel ahora maneja la columna **"Cantidad"**:

```
| Descripción | Cantidad | Costo Unitario | Subtotal |
|------------|----------|----------------|----------|
| Laptop     | 2        | 800.00         | 1600.00  |
| Mouse      | 10       | 15.00          | 150.00   |
```

Comportamiento:
- La cantidad se lee del Excel
- Se almacena en el campo `quantity`
- Los totales se calculan automáticamente

---

## 🔧 Migración de Datos Existentes

### Ejecutar Migración

```bash
python migrate_add_quantity.py
```

**Resultado:**
- Se agrega columna `quantity` a `quote_lines`
- Todas las líneas existentes reciben `quantity = 1`
- Los cálculos se mantienen consistentes

### Compatibilidad

El sistema es **100% compatible hacia atrás**:
- Líneas sin `quantity` se asumen como `quantity = 1`
- Los totales se calculan dinámicamente en tiempo de ejecución
- No se requiere modificar cotizaciones cerradas

---

## 🧮 Módulo `line_calculations.py`

### Funciones Disponibles

#### 1. `calculate_from_price_and_cost(price_unit, cost_unit, quantity)`
Calcula el margen a partir de precio y costo.

**Ejemplo:**
```python
result = calculate_from_price_and_cost(100, 60, 2)
# {
#   "price_unit": 100,
#   "cost_unit": 60,
#   "margin_pct": 40.0,
#   "quantity": 2,
#   "total_price": 200,
#   "total_cost": 120
# }
```

#### 2. `calculate_from_price_and_margin(price_unit, margin_pct, quantity)`
Calcula el costo a partir de precio y margen.

**Ejemplo:**
```python
result = calculate_from_price_and_margin(100, 20, 1)
# {
#   "price_unit": 100,
#   "cost_unit": 80.0,
#   "margin_pct": 20,
#   "quantity": 1,
#   "total_price": 100,
#   "total_cost": 80.0
# }
```

#### 3. `calculate_from_cost_and_margin(cost_unit, margin_pct, quantity)`
Calcula el precio a partir de costo y margen.

**Ejemplo:**
```python
result = calculate_from_cost_and_margin(80, 20, 1)
# {
#   "price_unit": 100.0,
#   "cost_unit": 80,
#   "margin_pct": 20,
#   "quantity": 1,
#   "total_price": 100.0,
#   "total_cost": 80
# }
```

#### 4. `update_with_quantity_change(price_unit, cost_unit, margin_pct, new_quantity)`
Actualiza totales cuando cambia la cantidad.

**Ejemplo:**
```python
result = update_with_quantity_change(100, 80, 20, 3)
# {
#   "price_unit": 100,
#   "cost_unit": 80,
#   "margin_pct": 20,
#   "quantity": 3,
#   "total_price": 300,
#   "total_cost": 240
# }
```

#### 5. `recalculate_line(changed_field, **kwargs)`
Función principal que determina qué recalcular según el campo que cambió.

**Ejemplo:**
```python
# Usuario cambió el precio
result = recalculate_line('price', price_unit=120, cost_unit=80, quantity=2)

# Usuario cambió el margen
result = recalculate_line('margin', price_unit=100, margin_pct=30, quantity=1)

# Usuario cambió la cantidad
result = recalculate_line('quantity', price_unit=100, cost_unit=60, margin_pct=40, quantity=5)
```

---

## 🔍 Comparación de Versiones

### Cambios Detectados

El sistema ahora detecta cambios en:
- **Precio unitario**
- **Costo unitario**
- **Margen porcentual**
- **Cantidad** ← NUEVO
- **Total por línea** ← NUEVO

### Vista de Diferencias

```
➕ Líneas Agregadas: 2
  • SKU-001: $100.00 x 3 = $300.00
  • SKU-002: $50.00 x 1 = $50.00

➖ Líneas Eliminadas: 1
  • SKU-003: $200.00 x 2 = $400.00

🔄 Líneas Modificadas: 1
  (Cambios en precio, costo, margen o cantidad)
```

---

## 📊 Visualizaciones

### Gráficas Actualizadas

1. **Aportación por Componente**
   - Usa `total_price` (precio × cantidad)
   - Refleja el valor real de cada componente

2. **Costo vs Utilidad Bruta**
   - Usa totales globales
   - Considera todas las cantidades

---

## ✅ Validaciones

### Reglas de Negocio

1. **Cantidad**:
   - Debe ser ≥ 1
   - Tipo: entero positivo

2. **Margen**:
   - Rango válido: 0% - 99.99%
   - No puede ser 100% o mayor

3. **Costo**:
   - No puede ser negativo
   - Puede ser 0 (productos sin costo)

4. **Precio**:
   - Debe ser > 0 si hay costo
   - Se calcula automáticamente si se proporciona margen

---

## 🎯 Casos de Uso

### Caso 1: Venta de Múltiples Unidades

**Escenario:**
Cliente solicita 10 laptops

**Proceso:**
1. Ingresar línea con precio unit. $800, costo unit. $600
2. Establecer cantidad = 10
3. Sistema calcula automáticamente:
   - Margen: 25%
   - Total precio: $8,000
   - Total costo: $6,000
   - Utilidad: $2,000

### Caso 2: Ajuste de Margen en Volumen

**Escenario:**
Cliente negocia mejor margen por comprar más unidades

**Proceso:**
1. Línea existente: 5 unidades al 30% margen
2. Cliente acepta 20 unidades si margen baja a 20%
3. Cambiar cantidad a 20 y margen a 20%
4. Sistema recalcula precio automáticamente

### Caso 3: Análisis de Rentabilidad

**Escenario:**
Evaluar cuántas unidades se deben vender para alcanzar meta de utilidad

**Proceso:**
1. Establecer precio y costo unitarios
2. Ir ajustando cantidad
3. Ver cómo cambia la utilidad total
4. Encontrar el punto óptimo

---

## 🚀 Próximos Pasos Recomendados

### Mejoras Futuras

1. **Editor en Línea**
   - Editar cantidad directamente en la tabla
   - Recálculo en tiempo real

2. **Descuentos por Volumen**
   - Reglas: "Si cantidad > 10, descuento 5%"
   - Aplicación automática

3. **Alertas Inteligentes**
   - "Cantidad atípica detectada"
   - "Margen bajo para esta cantidad"

4. **Plantillas de Cantidad**
   - Guardar configuraciones comunes
   - "Venta individual", "Venta al mayoreo"

---

## 📚 Referencias

### Archivos Modificados

1. **database.py**
   - Esquema actualizado con campo `quantity`
   - Queries actualizados para incluir cantidad

2. **app.py**
   - Formulario con campo de cantidad
   - Cálculos de totales actualizados
   - Comparaciones consideran cantidad

3. **excel_import.py**
   - Importación de columna "Cantidad"
   - Validación de cantidad

4. **line_calculations.py** ← NUEVO
   - Módulo de cálculos automáticos
   - Funciones helper reutilizables

5. **migrate_add_quantity.py** ← NUEVO
   - Script de migración
   - Agrega columna a bases existentes

### Ecuaciones de Referencia

```
Margen % = ((Precio - Costo) / Precio) × 100
Precio = Costo / (1 - Margen% / 100)
Costo = Precio × (1 - Margen% / 100)
Total = Unitario × Cantidad
```

---

## 🎖️ Beneficios del Sistema

### Para Vendedores

✅ **Transparencia**: Ver cómo cada cambio afecta los totales
✅ **Velocidad**: Cálculos instantáneos al modificar valores
✅ **Flexibilidad**: Cambiar cualquier atributo y el resto se ajusta

### Para Gerentes

✅ **Trazabilidad**: Historial de cambios en cantidad
✅ **Análisis**: Comparar versiones con diferentes cantidades
✅ **Control**: Validaciones automáticas de negocio

### Para Clientes

✅ **Claridad**: Desglose completo de cantidades y precios
✅ **Confianza**: Cálculos precisos y consistentes
✅ **Negociación**: Fácil simular diferentes escenarios

---

**Documentación actualizada:** 10 de Febrero, 2026  
**Versión del sistema:** 3.0 (con sistema de cantidad)  
**Estado:** ✅ Producción Ready
