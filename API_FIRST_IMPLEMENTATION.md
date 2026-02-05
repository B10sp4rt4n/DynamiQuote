# Plan de Implementación API-First - DynamiQuote

## 🎯 Objetivo

Implementar arquitectura API-First de forma **progresiva y controlada**, sin romper funcionalidad existente.

## 📊 Correcciones Críticas Implementadas

### 1. **BUG: evaluate_health() ignoraba PLAYBOOKS**

**Problema detectado:**
```python
# Código legacy en aup_engine.py
def evaluate_health(margin_pct):
    if margin_pct >= 0.35:  # ❌ Hardcoded
        return "green"
```

**PLAYBOOKS define thresholds diferentes:**
- General: 35%/25%
- MSP: 30%/20%
- Gobierno: 20%/15%
- Penetración: 15%/10%

**Solución implementada:**
```python
# src/domain/profitability_calculator.py
def evaluate_health(margin_pct, playbook_name="General"):
    playbook = get_playbook(playbook_name)
    if margin_pct >= playbook["green"]:
        return "green"
    if margin_pct >= playbook["yellow"]:
        return "yellow"
    return "red"
```

### 2. **Fórmula de margin_pct preservada**

✅ **Correcto (código real):** `margin_pct = gross_profit / subtotal_price`  
❌ **Incorrecto (propuesta inicial):** `margin_pct = (price - cost) / cost`

**Diferencia:** Margen sobre precio de venta vs margen sobre costo.

Ejemplo:
- Costo: $100, Precio: $150
- Método real: (150-100)/150 = **33.3%**
- Método incorrecto: (150-100)/100 = **50%**

### 3. **price_unit es INPUT, no OUTPUT**

El usuario INGRESA el precio, no se calcula desde margen. El margen es el resultado.

```python
# ❌ Incorrecto
final_price = cost * (1 + margin)

# ✅ Correcto
# Usuario ingresa cost_unit y price_unit
# Sistema calcula margin = (price - cost) / price
```

## 📁 Estructura Creada

```
DynamiQuote/
├── src/
│   ├── config/
│   │   └── playbooks.py          # Configuración de PLAYBOOKS centralizada
│   ├── domain/
│   │   └── profitability_calculator.py  # Lógica de negocio extraída
│   ├── api/
│   │   ├── models.py              # Modelos Pydantic
│   │   └── main.py                # Backend FastAPI
│   └── ui/
│       └── streamlit_api_migration_example.py  # Feature flags
├── tests/
│   └── test_profitability_equivalence.py  # Tests legacy vs API
└── API_FIRST_IMPLEMENTATION.md
```

## 🚀 Guía de Ejecución

### Paso 1: Instalar Dependencias

```bash
pip install fastapi uvicorn pydantic pytest requests
```

### Paso 2: Ejecutar Tests de Equivalencia

**Crítico:** Esto verifica que el nuevo código replica exactamente el legacy.

```bash
cd /workspaces/DynamiQuote
pytest tests/test_profitability_equivalence.py -v
```

**Tests incluidos:**
- ✅ Cálculo básico idéntico
- ✅ Items sin precio
- ✅ Edge cases (costo cero, precio cero)
- ✅ Thresholds por playbook (General, MSP, Penetración)
- ✅ Batch processing
- ✅ Márgenes negativos

### Paso 3: Levantar Backend FastAPI

```bash
cd /workspaces/DynamiQuote
python src/api/main.py
```

**Endpoints disponibles:**
- `GET http://localhost:8000/` - Health check
- `GET http://localhost:8000/playbooks` - Lista de playbooks
- `POST http://localhost:8000/calculate/batch` - Cálculo batch (recomendado)
- `POST http://localhost:8000/calculate/single` - Cálculo individual

### Paso 4: Probar API con curl

```bash
# Health check
curl http://localhost:8000/

# Obtener playbooks
curl http://localhost:8000/playbooks

# Calcular batch
curl -X POST http://localhost:8000/calculate/batch \
  -H "Content-Type: application/json" \
  -d '{
    "playbook_name": "General",
    "items": [
      {"quantity": 10, "cost_unit": 100, "price_unit": 150},
      {"quantity": 5, "cost_unit": 200, "price_unit": 280}
    ]
  }'
```

### Paso 5: Ejecutar Frontend con Feature Flags

```bash
cd /workspaces/DynamiQuote
streamlit run src/ui/streamlit_api_migration_example.py
```

**Modo de uso:**
1. Abrir http://localhost:8501
2. En sidebar: Toggle "Usar API para cálculos"
3. Ingresar items en editor
4. Calcular y comparar resultados

**Feature Flags:**
- ✅ **Activado:** Usa API backend (FastAPI)
- ❌ **Desactivado:** Usa código legacy (aup_engine.py)

### Paso 6: Migración Progresiva a app.py

Una vez validado, integrar en `app.py`:

```python
# En app.py, importar wrapper
from src.ui.streamlit_api_migration_example import calculate_items_with_fallback

# Reemplazar llamadas directas a aup_engine
# ANTES:
nodes = [calculate_item_node(item) for item in items]

# DESPUÉS:
nodes = calculate_items_with_fallback(items, playbook_name)
```

## 📊 Rendimiento Esperado

### Sin API (Legacy)
- 100 líneas = 100 cálculos inline
- Tiempo: ~50ms (cálculo en memoria)

### Con API (Batch Endpoint)
- 100 líneas = 1 HTTP call
- Tiempo: ~150-200ms (incluye latencia HTTP)

**Trade-off:** Latencia ligeramente mayor, pero arquitectura escalable.

## ✅ Checklist de Validación

Antes de migrar a producción, verificar:

- [ ] Todos los tests pasan (`pytest tests/test_profitability_equivalence.py`)
- [ ] API responde correctamente (health check OK)
- [ ] Resultados idénticos entre legacy y API (comparar con feature flag)
- [ ] Thresholds de PLAYBOOKS se aplican correctamente
- [ ] Edge cases manejados (precio cero, costo cero, márgenes negativos)
- [ ] Batch endpoint procesa 100+ líneas en <200ms
- [ ] Fallback automático funciona si API falla

## 🐛 Solución de Problemas

### API no arranca
```bash
# Verificar puerto 8000 libre
lsof -i :8000

# Matar proceso si está ocupado
kill -9 <PID>
```

### Tests fallan en health evaluation
**Causa:** Legacy usa thresholds hardcoded, nuevo usa playbook.

**Solución:** Especificar playbook="General" para que thresholds coincidan (0.35/0.25).

### Resultados difieren
**Revisar:**
1. ¿margin_pct se calcula sobre precio de venta?
2. ¿price_unit es entrada, no calculado?
3. ¿Playbook correcto seleccionado?

## 📈 Próximos Pasos

1. **Semana 1:** Validar equivalencia con tests ✅
2. **Semana 2:** Integrar feature flags en app.py principal
3. **Semana 3:** Migrar 25% de usuarios a modo API
4. **Semana 4:** Migrar 50% de usuarios
5. **Semana 5:** Migrar 100% y deprecar legacy
6. **Semana 6:** Remover código legacy de app.py

## 📝 Notas Importantes

### Diferencias con Propuesta Inicial

Tu propuesta inicial tenía 3 desviaciones:

1. **evaluate_health() con thresholds fijos (50%/25%)** → Corregido para usar PLAYBOOKS
2. **margin_pct = (price-cost)/cost** → Corregido a gross_profit/subtotal_price
3. **final_price calculado desde margen** → Corregido: price es INPUT

### Por Qué No Usar Decimal

El código legacy usa `float` directamente, no `Decimal`. Mantuvimos esto por equivalencia.

**Si quieres migrar a Decimal** (recomendado para precisión financiera):
- Modificar `ProfitabilityCalculator` para usar Decimal internamente
- Serializar como string en Pydantic
- Actualizar tests para comparar con tolerancia

## 🎓 Referencias

- [API_FIRST_ARCHITECTURE_ANALYSIS.md](API_FIRST_ARCHITECTURE_ANALYSIS.md) - Análisis completo
- [REFACTOR_CHALLENGES_20PCT.md](REFACTOR_CHALLENGES_20PCT.md) - Top 5 retos técnicos
- [aup_engine.py](aup_engine.py#L110-L147) - Código legacy original
