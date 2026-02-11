# Guía de Migración: Legacy → QuoteState

**Fecha:** 11 de febrero de 2026  
**Branch:** `refactor/legacy-state-management`  
**Versión:** 1.0

## 📋 Resumen

Esta guía documenta la migración incremental del sistema de cotizaciones de DynamiQuote desde una arquitectura legacy (basada en manipulación directa de `st.session_state`) hacia una arquitectura moderna con gestión centralizada de estado (QuoteState).

---

## 🏗️ Arquitectura Actual (Híbrida)

### Estado Actual: Dual-Source

La aplicación mantiene **dos representaciones del estado** sincronizadas:

```python
# 1. Legacy (para compatibilidad)
st.session_state.lines = [...]  # Lista de dicts

# 2. Moderna (para operaciones)
st.session_state.quote_state = QuoteState(...)  # Objeto QuoteState
```

### Funciones de Sincronización

```python
def sync_quote_state_to_legacy():
    """QuoteState → st.session_state.lines"""
    st.session_state.lines = st.session_state.quote_state.lines.copy()

def sync_legacy_to_quote_state():
    """st.session_state.lines → QuoteState"""
    st.session_state.quote_state.lines = st.session_state.lines.copy()
```

**Ubicación:** [app.py#L280-304](app.py#L280-304)

---

## 🎯 Principios de la Migración

### ✅ Qué Está Migrado (Fase 2 completa)

| Operación | Código Legacy | Código QuoteState | Estado |
|-----------|---------------|-------------------|--------|
| Agregar línea | `st.session_state.lines.append()` | `quote_state.add_line()` | ✅ Migrado |
| Editar línea | Modificación directa dict | `quote_state.update_line()` | ✅ Migrado |
| Eliminar línea | `st.session_state.lines.pop()` | `quote_state.remove_line()` | ✅ Migrado |
| Limpiar todo | `st.session_state.lines = []` | `quote_state.clear_lines()` | ✅ Migrado |
| Calcular totales | Sumas manuales en pandas | `quote_state.calculate_totals()` | ✅ Migrado |
| Validación | Dispersa | `ValidationError` uniforme | ✅ Migrado |

### ⏳ Qué Permanece Legacy (Temporal)

| Área | Razón | Líneas en app.py |
|------|-------|------------------|
| Confirmación de correcciones (área duplicada) | Código anterior a integración QuoteState | ~1422-1437 |
| Carga desde versión anterior | Manipula st.session_state.lines directamente | ~1585-1620 |
| Carga desde propuesta | Manipula st.session_state.lines directamente | ~1706-1722 |
| Display de tabla | Usa `pd.DataFrame(st.session_state.lines)` | ~1919 |
| Reset de oportunidad | Limpia ambas estructuras | ~2222, 2239 |

**Nota:** Estas áreas funcionan correctamente con sincronización bidireccional.

---

## 🔧 Patrones de Uso

### Patrón 1: Agregar Línea

**❌ Legacy (NO usar en código nuevo):**
```python
line_dict = {"sku": "ABC", "quantity": 1, ...}
st.session_state.lines.append(line_dict)
st.rerun()
```

**✅ QuoteState (usar en código nuevo):**
```python
line_data = {"sku": "ABC", "quantity": 1, ...}
try:
    quote_state = st.session_state.quote_state
    added_line = quote_state.add_line(line_data)
    sync_quote_state_to_legacy()  # Sincronizar
    st.success(f"✅ Línea agregada: {added_line['sku']}")
    st.rerun()
except ValidationError as e:
    st.error(f"❌ {e}")
```

**Beneficios:**
- ✅ Validación automática (SKU, descripción, cantidad, costo)
- ✅ Cálculos automáticos (margen, subtotales)
- ✅ Verificación de duplicados
- ✅ Manejo de errores consistente

---

### Patrón 2: Editar Línea

**❌ Legacy:**
```python
st.session_state.lines[idx]["sku"] = new_sku
st.session_state.lines[idx]["quantity"] = new_quantity
# Recalcular margen manualmente
margen = ((precio - costo) / precio) * 100
st.session_state.lines[idx]["margin_pct"] = margen
st.rerun()
```

**✅ QuoteState:**
```python
updated_data = {"sku": new_sku, "quantity": new_quantity, ...}
try:
    quote_state.update_line(idx, updated_data)
    sync_quote_state_to_legacy()
    st.success("✅ Cambios aplicados")
    st.rerun()
except ValidationError as e:
    st.error(f"❌ {e}")
```

**Beneficios:**
- ✅ Recálculo automático de márgenes
- ✅ Validación de datos
- ✅ Verificación de índice válido

---

### Patrón 3: Eliminar Línea

**❌ Legacy:**
```python
st.session_state.lines.pop(idx)
st.rerun()
```

**✅ QuoteState:**
```python
quote_state.remove_line(idx)
sync_quote_state_to_legacy()
st.rerun()
```

---

### Patrón 4: Calcular Totales

**❌ Legacy:**
```python
df = pd.DataFrame(st.session_state.lines)
total_cost = df["subtotal_cost"].sum()
total_revenue = df["subtotal_price"].sum()
gross_profit = total_revenue - total_cost
gross_margin_pct = (gross_profit / total_revenue * 100) if total_revenue > 0 else 0
```

**✅ QuoteState:**
```python
quote_state = st.session_state.quote_state
sync_legacy_to_quote_state()  # Asegurar sincronización
totals = quote_state.calculate_totals()

total_revenue = totals["total_revenue"]
total_cost = totals["total_cost"]
gross_profit = totals["gross_profit"]
gross_margin_pct = totals["avg_margin_pct"]
```

**Beneficios:**
- ✅ Evita división por cero
- ✅ Cálculos consistentes
- ✅ Incluye health_status (análisis de márgenes)

---

### Patrón 5: Validar Antes de Agregar

**❌ Legacy:**
```python
if not sku or not description:
    st.error("Campos requeridos")
    return
# Sin validación adicional
```

**✅ QuoteState:**
```python
from quote import ValidationError

try:
    validate_sku(sku)
    validate_description(description)
    validate_quantity(quantity)
    validate_cost(cost_unit)
    # ... o dejar que add_line() valide todo
except ValidationError as e:
    st.error(f"❌ {e}")
```

---

## 🔄 Cuándo Sincronizar

### Regla General

**Después de operaciones QuoteState:**
```python
quote_state.add_line(...)
sync_quote_state_to_legacy()  # ← Siempre después de modificar quote_state
```

**Antes de operaciones QuoteState que leen:**
```python
sync_legacy_to_quote_state()  # ← Si se modificó st.session_state.lines directamente
totals = quote_state.calculate_totals()
```

### Tabla de Sincronización

| Operación | Sincronizar Antes | Sincronizar Después |
|-----------|-------------------|---------------------|
| `add_line()` | No | ✅ Sí | 
| `update_line()` | No | ✅ Sí |
| `remove_line()` | No | ✅ Sí |
| `clear_lines()` | No | ✅ Sí |
| `calculate_totals()` | ✅ Sí (si hay cambios legacy) | No |
| Cargar desde DB | No (carga directa a legacy) | ✅ Sí |

---

## 🚀 Plan de Migración Completa (Futuro)

### Fase 4: Cleanup Final (Opcional)

Una vez que TODA la aplicación use QuoteState:

#### 1. Eliminar Funciones Sync
```python
# Eliminar estas funciones:
def sync_quote_state_to_legacy(): ...
def sync_legacy_to_quote_state(): ...
```

#### 2. Eliminar st.session_state.lines
```python
# Cambiar todas las referencias:
# Antes:
df = pd.DataFrame(st.session_state.lines)
# Después:
df = pd.DataFrame(st.session_state.quote_state.lines)
```

#### 3. Simplificar Inicialización
```python
# Eliminar:
st.session_state.lines = []

# Mantener solo:
st.session_state.quote_state = QuoteState(...)
```

#### 4. Actualizar Guardado en DB
```python
# En lugar de iterar st.session_state.lines:
for line in st.session_state.quote_state.lines:
    insert_quote_line(...)
```

---

## 📚 Recursos del Módulo QuoteState

### Documentación

- **README completo:** [quote/README.md](quote/README.md)
- **API Reference:** Ver docstrings en código
- **Tests:** [tests/test_quote_module.py](tests/test_quote_module.py)

### Importar Módulo

```python
from quote import (
    QuoteState,
    ValidationError,
    calculate_margin,
    calculate_price_from_margin,
    validate_line
)
```

### Crear QuoteState

```python
quote_state = QuoteState(
    quote_id="abc-123",
    quote_group_id="group-456",
    version=1
)
```

### Trabajar con Líneas

```python
# Agregar
line = quote_state.add_line({
    "sku": "ABC-001",
    "description": "Producto X",
    "quantity": 10,
    "cost_unit": 100.0,
    "price_unit": 150.0,
    "line_type": "product"
})

# Actualizar
quote_state.update_line(0, {"quantity": 20})

# Eliminar
quote_state.remove_line(0)

# Calcular totales
totals = quote_state.calculate_totals()
```

### Manejo de Errores

```python
try:
    quote_state.add_line({"sku": "", ...})
except ValidationError as e:
    print(f"Error: {e}")
    # Error: El SKU no puede estar vacío
```

---

## ✅ Checklist para Nuevas Funcionalidades

Al agregar nuevas funcionalidades que manipulen cotizaciones:

- [ ] ¿Usas `quote_state.add_line()` en lugar de `append()`?
- [ ] ¿Usas `quote_state.update_line()` en lugar de modificar dict directamente?
- [ ] ¿Usas `quote_state.remove_line()` en lugar de `pop()`?
- [ ] ¿Manejas `ValidationError` con try/except?
- [ ] ¿Sincronizas con `sync_quote_state_to_legacy()` después de modificar?
- [ ] ¿Usas `quote_state.calculate_totals()` en lugar de sum() manual?
- [ ] ¿Agregaste tests para la nueva funcionalidad?

---

## 🐛 Troubleshooting

### Problema: "Líneas no aparecen en la tabla"

**Causa:** Falta sincronización después de modificar QuoteState

**Solución:**
```python
quote_state.add_line(...)
sync_quote_state_to_legacy()  # ← Agregar esto
st.rerun()
```

### Problema: "ValidationError al agregar línea"

**Causa:** Datos inválidos o campos faltantes

**Solución:** Revisar mensaje de error específico:
```python
try:
    quote_state.add_line(line_data)
except ValidationError as e:
    st.error(f"Detalle: {e}")  # Ver qué campo falló
```

### Problema: "Totales no coinciden"

**Causa:** QuoteState y legacy desincronizados

**Solución:**
```python
# Sincronizar antes de calcular:
sync_legacy_to_quote_state()
totals = quote_state.calculate_totals()
```

### Problema: "Tests fallan después de cambios"

**Solución:** Ejecutar suite completa:
```bash
pytest tests/test_quote_module.py -v
```

---

## 📊 Métricas de Migración

### Estado Actual (Fase 2 Completa)

- **Operaciones migradas:** 6/6 (100%)
  - ✅ add_line
  - ✅ update_line
  - ✅ remove_line
  - ✅ clear_lines
  - ✅ calculate_totals
  - ✅ validación

- **Tests:** 14/14 passing
- **Cobertura:** Operaciones críticas 100%
- **Documentación:** Completa

### Beneficios Alcanzados

| Métrica | Antes | Después | Mejora |
|---------|-------|---------|--------|
| Cálculos duplicados | 5+ | 1 | -80% |
| Tests | 0 | 14 | +∞ |
| Validación consistente | No | Sí | ✅ |
| Manejo de errores | Disperso | Uniforme | ✅ |
| Complejidad por rerun | Alta | Media | ↓ |

---

## 🎓 Mejores Prácticas

### DO ✅

1. **Siempre usar QuoteState para operaciones**
   ```python
   quote_state.add_line(...)  # ✅ Correcto
   ```

2. **Sincronizar después de modificar**
   ```python
   quote_state.add_line(...)
   sync_quote_state_to_legacy()  # ✅ Necesario
   ```

3. **Manejar ValidationError**
   ```python
   try:
       quote_state.add_line(...)
   except ValidationError as e:
       st.error(f"❌ {e}")  # ✅ Usuario ve error claro
   ```

4. **Escribir tests para nueva funcionalidad**
   ```python
   def test_nueva_funcionalidad():
       quote_state = QuoteState(...)
       # ... test logic
   ```

### DON'T ❌

1. **NO modificar st.session_state.lines directamente**
   ```python
   st.session_state.lines.append(...)  # ❌ No hacer
   ```

2. **NO calcular márgenes manualmente**
   ```python
   margen = ((p - c) / p) * 100  # ❌ Usar calculate_margin()
   ```

3. **NO olvidar sincronizar**
   ```python
   quote_state.add_line(...)
   st.rerun()  # ❌ Falta sync_quote_state_to_legacy()
   ```

4. **NO ignorar ValidationError**
   ```python
   quote_state.add_line(...)  # ❌ Sin try/except
   ```

---

## 📝 Changelog de Migración

### v1.0 - 11 de febrero de 2026

**Añadido:**
- ✅ Módulo `quote/` completo (1,265 LOC)
- ✅ QuoteState class con gestión centralizada
- ✅ 14 tests unitarios (100% passing)
- ✅ Funciones de sincronización bidireccional
- ✅ Integración en 9 secciones de app.py

**Mejorado:**
- ✅ Cálculos centralizados (eliminada duplicación)
- ✅ Validación consistente con ValidationError
- ✅ Manejo de errores robusto
- ✅ Documentación completa

**Mantenido:**
- ⏳ Arquitectura híbrida (temporal)
- ⏳ Funciones sync (necesarias)
- ⏳ st.session_state.lines (compatibilidad)

---

## 🤝 Contribuir

### Agregar Nueva Validación

1. Agregar función en [quote/validators.py](quote/validators.py)
2. Agregar test en [tests/test_quote_module.py](tests/test_quote_module.py)
3. Llamar desde `validate_line()` o directamente
4. Actualizar documentación

### Agregar Nuevo Cálculo

1. Agregar función en [quote/calculations.py](quote/calculations.py)
2. Agregar test
3. Usar desde QuoteState o directamente
4. Actualizar docstrings

---

## 📞 Soporte

- **Issues:** Ver [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **Tests:** `pytest tests/test_quote_module.py -v`
- **Documentación:** [quote/README.md](quote/README.md)
- **Análisis:** [RERUN_ANALYSIS.md](RERUN_ANALYSIS.md)

---

**Última actualización:** 11 de febrero de 2026  
**Versión:** 1.0  
**Estado:** ✅ Fase 2 completa, arquitectura híbrida estable
