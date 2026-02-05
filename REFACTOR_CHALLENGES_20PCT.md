# 🔥 Top 20% Retos Complejos - Refactorización DynamiQuote

**Fecha:** 5 de Febrero, 2026  
**Contexto:** Migración de arquitectura monolítica a Clean Architecture + DDD  
**Complejidad:** Alta - Estos son los problemas que podrían romper el sistema  

---

## 🎯 Resumen Ejecutivo

De toda la refactorización propuesta (8-10 semanas), **estos 5 retos representan el 80% del riesgo**:

| # | Reto | Complejidad | Riesgo | Tiempo Estimado |
|---|------|-------------|--------|-----------------|
| 1 | Preservar precisión Decimal en Value Objects | 🔴🔴🔴🔴 | CRÍTICO | 1-2 semanas |
| 2 | Migrar calculate_item_node() sin romper lógica | 🔴🔴🔴🔴 | CRÍTICO | 1-2 semanas |
| 3 | Mantener compatibilidad con session_state de Streamlit | 🔴🔴🔴 | ALTO | 3-5 días |
| 4 | Serializar Value Objects para PostgreSQL | 🔴🔴🔴 | ALTO | 3-5 días |
| 5 | Implementar DynamicSwitch sin afectar playbooks | 🔴🔴 | MEDIO | 2-3 días |

**Total estimado para estos 5 retos:** 3-4 semanas (50% del tiempo total)

---

## 🔴 RETO #1: Preservar Precisión Decimal en Value Objects

### **Por qué es complejo:**

El código actual usa `Decimal` de Python para cálculos financieros críticos. Si migran a Value Objects que usan `float`, **perderán precisión** y generarán bugs silenciosos.

### **Código Actual (Correcto):**

```python
# aup_engine.py línea 110-125
def calculate_item_node(item: Dict[str, Any]) -> Dict[str, Any]:
    cost_unit = Decimal(str(item.get("cost_unit", 0)))
    quantity = Decimal(str(item.get("quantity", 1)))
    final_price_unit = Decimal(str(item.get("final_price_unit", 0)))
    
    subtotal_cost = cost_unit * quantity                    # Decimal * Decimal = EXACTO
    subtotal_revenue = final_price_unit * quantity          # Decimal * Decimal = EXACTO
    margin_absolute = final_price_unit - cost_unit          # Decimal - Decimal = EXACTO
    margin_pct = (margin_absolute / cost_unit * 100) if cost_unit > 0 else Decimal(0)
    
    # ✅ Todos los cálculos son EXACTOS (sin errores de redondeo)
    
    return {
        "subtotal_cost": float(subtotal_cost),              # Conversión solo al final
        "subtotal_revenue": float(subtotal_revenue),
        "margin_pct": float(margin_pct)
    }
```

### **Refactorización INCORRECTA (⚠️ Pierde precisión):**

```python
# ❌ MAL - Value Object naive con float
class Money:
    def __init__(self, amount: float, currency: str = "USD"):
        self.amount = amount  # ❌ float internamente
        self.currency = currency
    
    def multiply(self, factor: float) -> "Money":
        return Money(self.amount * factor)  # ❌ Errores de redondeo acumulados

# Uso:
cost = Money(123.45)
quantity = 3.7
subtotal = cost.multiply(quantity)

print(subtotal.amount)  # 456.765 (podría ser 456.764999999999)

# ❌ PROBLEMA: En 1000 cálculos, errores se acumulan
# Ejemplo real: $1,234,567.89 * 0.15 = $185,185.1835 → podría dar $185,185.1834999998
```

### **Refactorización CORRECTA (✅ Preserva precisión):**

```python
# ✅ BIEN - Value Object con Decimal
from decimal import Decimal, ROUND_HALF_UP

class Money:
    """Value Object inmutable que preserva precisión financiera."""
    
    def __init__(self, amount: Decimal | float | str, currency: str = "USD"):
        # Siempre convertir a Decimal
        if isinstance(amount, Decimal):
            self._amount = amount
        else:
            self._amount = Decimal(str(amount))
        
        self.currency = currency
    
    @property
    def amount(self) -> Decimal:
        """Retorna Decimal, NO float."""
        return self._amount
    
    def multiply(self, factor: Decimal | float) -> "Money":
        """Multiplica manteniendo precisión."""
        factor_decimal = Decimal(str(factor)) if not isinstance(factor, Decimal) else factor
        return Money(self._amount * factor_decimal, self.currency)
    
    def round(self, places: int = 2) -> "Money":
        """Redondea solo cuando es necesario."""
        quantize_str = f"0.{'0' * places}"
        rounded = self._amount.quantize(Decimal(quantize_str), rounding=ROUND_HALF_UP)
        return Money(rounded, self.currency)
    
    def to_float(self) -> float:
        """Conversión explícita a float (solo para display)."""
        return float(self._amount)
    
    def to_dict(self) -> dict:
        """Serialización para DB."""
        return {
            "amount": str(self._amount),  # ✅ Guardar como string para preservar precisión
            "currency": self.currency
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "Money":
        """Deserialización desde DB."""
        return cls(Decimal(data["amount"]), data["currency"])

# ✅ USO CORRECTO:
cost = Money("123.45")  # String para evitar float
quantity = Decimal("3.7")
subtotal = cost.multiply(quantity)

print(subtotal.amount)          # Decimal('456.765') - EXACTO
print(subtotal.round(2).amount) # Decimal('456.77')  - EXACTO
print(subtotal.to_float())      # 456.77 (solo para display)
```

### **Tests de Validación:**

```python
# test_money_precision.py
import pytest
from decimal import Decimal
from domain.value_objects import Money

def test_money_preserves_decimal_precision():
    """Validar que Money mantiene precisión Decimal."""
    # Caso real: $1,234,567.89 * 15% margen
    cost = Money("1234567.89")
    margin_factor = Decimal("0.15")
    
    margin_amount = cost.multiply(margin_factor)
    
    # Debe ser exacto
    expected = Decimal("185185.1835")
    assert margin_amount.amount == expected
    
    # NO debe tener errores de float
    assert margin_amount.amount != Decimal("185185.1834999998")

def test_money_matches_legacy_calculate_item_node():
    """Validar que Money da los mismos resultados que código legacy."""
    # Caso de aup_engine.py línea 110
    item = {
        "cost_unit": "100.50",
        "quantity": "3.7",
        "final_price_unit": "150.75"
    }
    
    # Legacy calculation (actual)
    cost_unit_legacy = Decimal(item["cost_unit"])
    quantity_legacy = Decimal(item["quantity"])
    subtotal_legacy = cost_unit_legacy * quantity_legacy
    
    # New calculation (refactored)
    cost_unit_new = Money(item["cost_unit"])
    quantity_new = Decimal(item["quantity"])
    subtotal_new = cost_unit_new.multiply(quantity_new)
    
    # DEBEN ser idénticos
    assert subtotal_new.amount == subtotal_legacy
    assert subtotal_new.to_float() == float(subtotal_legacy)

def test_money_serialization_roundtrip():
    """Validar que serialización no pierde precisión."""
    original = Money("999999.9999")
    
    # Simular guardado en DB
    serialized = original.to_dict()
    assert serialized == {"amount": "999999.9999", "currency": "USD"}
    
    # Simular lectura desde DB
    deserialized = Money.from_dict(serialized)
    
    # DEBE ser exactamente igual
    assert deserialized.amount == original.amount
    assert deserialized.currency == original.currency
```

### **Criterios de Éxito:**

- ✅ Todos los cálculos con Money dan **exactamente** los mismos resultados que Decimal actual
- ✅ Tests de precisión pasan con 100,000 operaciones sin acumulación de errores
- ✅ Serialización/deserialización preserva todos los dígitos decimales
- ✅ Comparación directa con `calculate_item_node()` original da resultados idénticos

### **Tiempo Estimado:** 1-2 semanas
### **Riesgo si falla:** 🔴 CRÍTICO - Errores financieros silenciosos en producción

---

## 🔴 RETO #2: Migrar calculate_item_node() sin Romper Lógica

### **Por qué es complejo:**

Esta función es el **corazón del sistema AUP**. Tiene 40 líneas de lógica compleja con:
- Cálculos de rentabilidad
- Evaluación de salud (verde/amarillo/rojo)
- Manejo de casos edge (división por cero, valores negativos)
- 6 campos calculados interdependientes

**Un solo bug aquí rompe todo el sistema.**

### **Código Actual (1,078 líneas en aup_engine.py):**

```python
# aup_engine.py línea 110-150
def calculate_item_node(item: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calcula nodo de rentabilidad independiente para un ítem.
    ESTA ES LA FUNCIÓN MÁS CRÍTICA DEL SISTEMA.
    """
    cost_unit = Decimal(str(item.get("cost_unit", 0)))
    quantity = Decimal(str(item.get("quantity", 1)))
    final_price_unit = Decimal(str(item.get("final_price_unit", 0)))
    
    # Subtotales
    subtotal_cost = cost_unit * quantity
    subtotal_revenue = final_price_unit * quantity
    
    # Márgenes
    margin_absolute = final_price_unit - cost_unit
    
    # ⚠️ EDGE CASE: División por cero
    if cost_unit > 0:
        margin_pct = margin_absolute / cost_unit * 100
    else:
        margin_pct = Decimal(0)
    
    # ⚠️ EDGE CASE: Margen negativo
    if margin_pct < 0:
        margin_pct = Decimal(0)
    
    # Evaluación de salud
    health = evaluate_health(float(margin_pct))
    
    # ⚠️ EDGE CASE: Valores infinitos o NaN
    def safe_float(value: Decimal) -> float:
        try:
            f = float(value)
            return 0.0 if (f != f or f == float('inf') or f == float('-inf')) else f
        except:
            return 0.0
    
    return {
        "cost_unit": safe_float(cost_unit),
        "quantity": safe_float(quantity),
        "final_price_unit": safe_float(final_price_unit),
        "subtotal_cost": safe_float(subtotal_cost),
        "subtotal_revenue": safe_float(subtotal_revenue),
        "margin_absolute": safe_float(margin_absolute),
        "margin_pct": safe_float(margin_pct),
        "health": health
    }
```

### **Estrategia de Migración (Shadow Mode):**

```python
# src/domain/services/profitability_calculator.py
from decimal import Decimal
from domain.entities import QuoteLine
from domain.value_objects import Money, Margin, HealthStatus
import logging

class ProfitabilityCalculator:
    """
    Domain Service para cálculo de rentabilidad.
    REPLICAR EXACTAMENTE la lógica de calculate_item_node().
    """
    
    @staticmethod
    def calculate_node(line: QuoteLine) -> "ProfitabilityNode":
        """
        Calcula nodo de rentabilidad.
        
        GARANTÍA: Devuelve exactamente los mismos valores que calculate_item_node().
        """
        # Conversión a tipos de dominio
        cost = Money(line.cost_unit)
        price = Money(line.final_price_unit)
        quantity = Decimal(str(line.quantity))
        
        # Subtotales (idéntica lógica)
        subtotal_cost = cost.multiply(quantity)
        subtotal_revenue = price.multiply(quantity)
        
        # Margen absoluto
        margin_absolute = Money(price.amount - cost.amount)
        
        # Margen porcentual con MISMO edge case handling
        if cost.amount > 0:
            margin_pct_value = (margin_absolute.amount / cost.amount) * 100
        else:
            margin_pct_value = Decimal(0)
        
        # MISMO edge case: margen negativo
        if margin_pct_value < 0:
            margin_pct_value = Decimal(0)
        
        # Crear Value Object con validación
        margin = Margin(margin_pct_value)
        
        # Evaluación de salud (MISMA función)
        health = HealthStatus.from_margin(margin.percentage)
        
        return ProfitabilityNode(
            cost_unit=cost,
            quantity=quantity,
            final_price_unit=price,
            subtotal_cost=subtotal_cost,
            subtotal_revenue=subtotal_revenue,
            margin_absolute=margin_absolute,
            margin=margin,
            health=health
        )
    
    @staticmethod
    def calculate_node_legacy_compatible(item: Dict[str, Any]) -> Dict[str, Any]:
        """
        Wrapper para compatibilidad con código legacy.
        Convierte Dict → QuoteLine → ProfitabilityNode → Dict
        """
        line = QuoteLine.from_dict(item)
        node = ProfitabilityCalculator.calculate_node(line)
        return node.to_dict()

# Wrapper en aup_engine.py para Shadow Mode
def calculate_item_node_with_validation(item: Dict[str, Any]) -> Dict[str, Any]:
    """
    Shadow Mode: ejecuta AMBAS versiones y compara resultados.
    En producción, usa legacy. En dev, valida equivalencia.
    """
    import os
    
    # Calcular con código legacy (actual)
    legacy_result = calculate_item_node_original(item)
    
    # Solo en desarrollo: calcular con nueva lógica y comparar
    if os.getenv("SHADOW_MODE", "false").lower() == "true":
        from domain.services import ProfitabilityCalculator
        
        try:
            new_result = ProfitabilityCalculator.calculate_node_legacy_compatible(item)
            
            # Comparar resultados
            for key in legacy_result:
                legacy_val = legacy_result[key]
                new_val = new_result.get(key)
                
                # Tolerancia de 0.01 para floats
                if isinstance(legacy_val, float):
                    diff = abs(legacy_val - new_val)
                    if diff > 0.01:
                        logging.error(
                            f"MISMATCH en {key}: legacy={legacy_val} vs new={new_val} (diff={diff})"
                        )
                elif legacy_val != new_val:
                    logging.error(
                        f"MISMATCH en {key}: legacy={legacy_val} vs new={new_val}"
                    )
        except Exception as e:
            logging.error(f"Error en nueva implementación: {e}")
    
    # SIEMPRE retornar resultado legacy (por ahora)
    return legacy_result

# Renombrar función original
calculate_item_node_original = calculate_item_node
calculate_item_node = calculate_item_node_with_validation
```

### **Tests de Regresión:**

```python
# tests/unit/domain/test_profitability_calculator.py
import pytest
from decimal import Decimal
from domain.services import ProfitabilityCalculator
from domain.entities import QuoteLine

# Casos de prueba extraídos de producción real
REAL_WORLD_TEST_CASES = [
    # Caso normal
    {
        "input": {"cost_unit": "100.50", "quantity": "3", "final_price_unit": "150.75"},
        "expected": {
            "subtotal_cost": 301.50,
            "subtotal_revenue": 452.25,
            "margin_pct": 50.0,
            "health": "verde"
        }
    },
    # Caso edge: división por cero
    {
        "input": {"cost_unit": "0", "quantity": "5", "final_price_unit": "100"},
        "expected": {
            "subtotal_cost": 0.0,
            "subtotal_revenue": 500.0,
            "margin_pct": 0.0,  # NO debe dar error
            "health": "rojo"
        }
    },
    # Caso edge: margen negativo
    {
        "input": {"cost_unit": "200", "quantity": "2", "final_price_unit": "150"},
        "expected": {
            "subtotal_cost": 400.0,
            "subtotal_revenue": 300.0,
            "margin_pct": 0.0,  # Negativo se convierte a 0
            "health": "rojo"
        }
    },
    # Caso real: decimales complejos
    {
        "input": {"cost_unit": "1234.567", "quantity": "3.7", "final_price_unit": "1850.89"},
        "expected": {
            "subtotal_cost": 4567.8979,
            "subtotal_revenue": 6848.293,
            "margin_pct": 49.94,  # Aprox
            "health": "verde"
        }
    },
]

@pytest.mark.parametrize("test_case", REAL_WORLD_TEST_CASES)
def test_calculate_node_matches_legacy(test_case):
    """Validar que nueva implementación da mismos resultados que legacy."""
    from aup_engine import calculate_item_node_original as legacy_calc
    
    item = test_case["input"]
    expected = test_case["expected"]
    
    # Calcular con legacy
    legacy_result = legacy_calc(item)
    
    # Calcular con nueva implementación
    new_result = ProfitabilityCalculator.calculate_node_legacy_compatible(item)
    
    # Comparar resultados clave
    assert abs(legacy_result["subtotal_cost"] - new_result["subtotal_cost"]) < 0.01
    assert abs(legacy_result["margin_pct"] - new_result["margin_pct"]) < 0.1
    assert legacy_result["health"] == new_result["health"]

def test_100k_calculations_performance():
    """Validar que nueva implementación no es más lenta."""
    import time
    
    item = {"cost_unit": "100", "quantity": "5", "final_price_unit": "150"}
    
    # Benchmark legacy
    start = time.time()
    for _ in range(100_000):
        calculate_item_node_original(item)
    legacy_time = time.time() - start
    
    # Benchmark nueva implementación
    start = time.time()
    for _ in range(100_000):
        ProfitabilityCalculator.calculate_node_legacy_compatible(item)
    new_time = time.time() - start
    
    # Nueva implementación NO debe ser más de 2x más lenta
    assert new_time < legacy_time * 2, f"Too slow: {new_time}s vs {legacy_time}s"
```

### **Criterios de Éxito:**

- ✅ Shadow Mode activo en desarrollo por 1-2 semanas sin errores
- ✅ 100% de tests de regresión pasan
- ✅ Performance no degrada más de 50%
- ✅ 0 diferencias en cálculos en 10,000 ítems de producción

### **Tiempo Estimado:** 1-2 semanas
### **Riesgo si falla:** 🔴 CRÍTICO - Cálculos incorrectos de rentabilidad

---

## 🔴 RETO #3: Compatibilidad con session_state de Streamlit

### **Por qué es complejo:**

Streamlit almacena estado en `st.session_state.lines` como lista de **dicts**. Si migran a objetos de dominio, romperán:
- Formularios existentes
- Serialización entre page refreshes
- Editor de tablas (data_editor)

### **Código Actual:**

```python
# app.py línea 1600-1650
# Agregar línea a sesión
if st.button("Agregar línea"):
    new_line = {
        "sku": sku,
        "description_final": description,
        "cost_unit": 100.50,          # float
        "final_price_unit": 150.75,   # float
        "quantity": 3,                # int
        "strategy": "penetration"     # string
    }
    st.session_state.lines.append(new_line)  # ✅ Streamlit serializa dict automáticamente

# DataFrame desde sesión
df = pd.DataFrame(st.session_state.lines)  # ✅ Funciona directo
st.data_editor(df)  # ✅ Streamlit entiende dict
```

### **Problema con Value Objects:**

```python
# ❌ ROMPE: Streamlit no puede serializar objetos custom
if st.button("Agregar línea"):
    from domain.entities import QuoteLine
    from domain.value_objects import Money
    
    new_line = QuoteLine(
        sku=sku,
        description_final=description,
        cost_unit=Money("100.50"),     # ❌ Money no es JSON serializable
        final_price_unit=Money("150.75"),
        quantity=3,
        strategy="penetration"
    )
    st.session_state.lines.append(new_line)  # ❌ ERROR: can't pickle Money object

# ❌ DataFrame no puede crear desde objetos
df = pd.DataFrame(st.session_state.lines)  # ❌ ERROR: unhashable type
```

### **Solución: Adapter Pattern**

```python
# src/presentation/adapters/session_state_adapter.py
from domain.entities import QuoteLine
from typing import List, Dict, Any

class SessionStateAdapter:
    """
    Adapta objetos de dominio para Streamlit session_state.
    """
    
    @staticmethod
    def lines_to_session(lines: List[QuoteLine]) -> List[Dict[str, Any]]:
        """
        Convierte QuoteLine[] → Dict[] para Streamlit.
        """
        return [line.to_dict() for line in lines]
    
    @staticmethod
    def lines_from_session(session_lines: List[Dict[str, Any]]) -> List[QuoteLine]:
        """
        Convierte Dict[] → QuoteLine[] desde Streamlit.
        """
        return [QuoteLine.from_dict(line_dict) for line_dict in session_lines]
    
    @staticmethod
    def ensure_compatible_format(session_lines: List) -> List[Dict]:
        """
        Garantiza que session_state.lines siempre sea List[Dict].
        Compatible con código legacy Y objetos de dominio.
        """
        if not session_lines:
            return []
        
        # Si ya son dicts, retornar directo
        if isinstance(session_lines[0], dict):
            return session_lines
        
        # Si son QuoteLine, convertir a dict
        if hasattr(session_lines[0], 'to_dict'):
            return SessionStateAdapter.lines_to_session(session_lines)
        
        # Fallback: forzar conversión
        return [dict(item) for item in session_lines]

# app.py modificado
import streamlit as st
from presentation.adapters import SessionStateAdapter

# Inicializar sesión (compatible con ambos formatos)
if "lines" not in st.session_state:
    st.session_state.lines = []

# Agregar línea (formato dict por compatibilidad)
if st.button("Agregar línea"):
    new_line_dict = {
        "sku": sku,
        "description_final": description,
        "cost_unit": cost_unit,  # Mantener como float/Decimal
        "final_price_unit": final_price,
        "quantity": quantity,
        "strategy": strategy
    }
    st.session_state.lines.append(new_line_dict)

# Usar objetos de dominio para lógica de negocio
lines_as_entities = SessionStateAdapter.lines_from_session(st.session_state.lines)

# Calcular con domain service
from domain.services import ProfitabilityCalculator
for line_entity in lines_as_entities:
    node = ProfitabilityCalculator.calculate_node(line_entity)
    # Usar node para lógica...

# DataFrame para UI (siempre desde dicts)
compatible_lines = SessionStateAdapter.ensure_compatible_format(st.session_state.lines)
df = pd.DataFrame(compatible_lines)
st.data_editor(df)
```

### **Criterios de Éxito:**

- ✅ st.session_state.lines permanece como List[Dict] (compatible)
- ✅ Conversión Dict ↔ QuoteLine sin pérdida de datos
- ✅ data_editor de Streamlit sigue funcionando
- ✅ Page refresh no pierde datos

### **Tiempo Estimado:** 3-5 días
### **Riesgo si falla:** 🔴 ALTO - UI deja de funcionar

---

## 🔴 RETO #4: Serializar Value Objects para PostgreSQL

### **Por qué es complejo:**

PostgreSQL no entiende Value Objects nativamente. Necesitan convertirse a tipos SQL estándar (JSON, TEXT, NUMERIC) sin perder semántica.

### **Problema Actual:**

```python
# database.py - guardan dict directamente
node = {
    "cost_unit": 100.50,
    "margin_pct": 30.5,
    "health": "verde"
}

# PostgreSQL entiende dict como JSONB
cur.execute(
    "INSERT INTO nodes (data) VALUES (%s)",
    (json.dumps(node),)  # ✅ Funciona directo
)
```

### **Problema con Value Objects:**

```python
# ❌ PostgreSQL NO sabe qué hacer con Money
node = ProfitabilityNode(
    cost_unit=Money("100.50"),  # ← ¿Cómo guardar esto?
    margin=Margin(30.5),         # ← ¿Y esto?
    health=HealthStatus.GREEN    # ← ¿Enum?
)

cur.execute(
    "INSERT INTO nodes (data) VALUES (%s)",
    (json.dumps(node),)  # ❌ ERROR: Object of type Money is not JSON serializable
)
```

### **Solución: Custom JSON Encoder**

```python
# src/infrastructure/database/serializers.py
import json
from decimal import Decimal
from domain.value_objects import Money, Margin, HealthStatus
from domain.entities import ProfitabilityNode

class DomainJSONEncoder(json.JSONEncoder):
    """
    Codificador JSON custom para Value Objects.
    """
    def default(self, obj):
        # Money → {"_type": "Money", "amount": "100.50", "currency": "USD"}
        if isinstance(obj, Money):
            return {
                "_type": "Money",
                "amount": str(obj.amount),  # Decimal como string
                "currency": obj.currency
            }
        
        # Margin → {"_type": "Margin", "percentage": "30.5"}
        if isinstance(obj, Margin):
            return {
                "_type": "Margin",
                "percentage": str(obj.percentage)
            }
        
        # HealthStatus → {"_type": "HealthStatus", "value": "verde"}
        if isinstance(obj, HealthStatus):
            return {
                "_type": "HealthStatus",
                "value": obj.value
            }
        
        # Decimal → string
        if isinstance(obj, Decimal):
            return str(obj)
        
        # Fallback a default
        return super().default(obj)

def domain_object_hook(dct):
    """
    Decodificador JSON custom para reconstruir Value Objects.
    """
    if "_type" not in dct:
        return dct
    
    obj_type = dct["_type"]
    
    if obj_type == "Money":
        return Money(dct["amount"], dct["currency"])
    
    if obj_type == "Margin":
        return Margin(Decimal(dct["percentage"]))
    
    if obj_type == "HealthStatus":
        return HealthStatus(dct["value"])
    
    return dct

# Uso en repository
class ProposalRepository:
    def save(self, proposal):
        node = proposal.profitability_node
        
        # Serializar con encoder custom
        node_json = json.dumps(node, cls=DomainJSONEncoder)
        
        cur.execute(
            "INSERT INTO proposals (id, node_data) VALUES (%s, %s)",
            (proposal.id, node_json)
        )
    
    def find_by_id(self, proposal_id):
        cur.execute("SELECT node_data FROM proposals WHERE id = %s", (proposal_id,))
        row = cur.fetchone()
        
        # Deserializar con decoder custom
        node_data = json.loads(row[0], object_hook=domain_object_hook)
        
        return Proposal(profitability_node=node_data)
```

### **Tests de Serialización:**

```python
def test_money_serialization_to_postgres():
    """Validar roundtrip Money → JSON → PostgreSQL → JSON → Money."""
    original = Money("123.45", "USD")
    
    # Serialize
    serialized = json.dumps(original, cls=DomainJSONEncoder)
    assert serialized == '{"_type": "Money", "amount": "123.45", "currency": "USD"}'
    
    # Deserialize
    deserialized = json.loads(serialized, object_hook=domain_object_hook)
    
    # Validate
    assert isinstance(deserialized, Money)
    assert deserialized.amount == original.amount
    assert deserialized.currency == original.currency

def test_full_node_postgres_roundtrip(db_connection):
    """Test completo: guardar y recuperar ProfitabilityNode."""
    from domain.services import ProfitabilityCalculator
    
    # Crear node
    line = QuoteLine(cost_unit="100", quantity=3, final_price_unit="150")
    original_node = ProfitabilityCalculator.calculate_node(line)
    
    # Guardar en PostgreSQL
    node_json = json.dumps(original_node.to_dict(), cls=DomainJSONEncoder)
    cur = db_connection.cursor()
    cur.execute(
        "CREATE TEMP TABLE test_nodes (id SERIAL, data JSONB)"
    )
    cur.execute(
        "INSERT INTO test_nodes (data) VALUES (%s) RETURNING id",
        (node_json,)
    )
    node_id = cur.fetchone()[0]
    
    # Recuperar desde PostgreSQL
    cur.execute("SELECT data FROM test_nodes WHERE id = %s", (node_id,))
    recovered_json = cur.fetchone()[0]
    recovered_node_dict = json.loads(recovered_json, object_hook=domain_object_hook)
    
    # Validar identidad
    assert recovered_node_dict["cost_unit"] == original_node.cost_unit
    assert recovered_node_dict["margin"]["percentage"] == original_node.margin.percentage
```

### **Criterios de Éxito:**

- ✅ Todos los Value Objects serializan/deserializan sin pérdida
- ✅ Compatible con PostgreSQL JSONB
- ✅ Compatible con queries JSON de PostgreSQL
- ✅ Performance aceptable (<10ms por objeto)

### **Tiempo Estimado:** 3-5 días
### **Riesgo si falla:** 🔴 ALTO - Pérdida de datos en persistencia

---

## 🔴 RETO #5: DynamicSwitch sin Romper Playbooks

### **Por qué es complejo:**

Los PLAYBOOKS actuales tienen umbrales fijos. DynamicSwitch introduce ajuste dinámico. Deben coexistir sin romper lógica existente.

### **Código Actual:**

```python
# app.py línea 40-90
PLAYBOOKS = {
    "General": {
        "green": 0.35,  # 35% margen mínimo para verde
        "yellow": 0.25,
        "max_red_green": 0.1
    },
    "Penetración": {
        "green": 0.15,  # Margen más bajo aceptable
        "yellow": 0.10
    }
}

# Uso directo
if margin_pct >= PLAYBOOKS["General"]["green"]:
    health = "verde"
```

### **Con DynamicSwitch:**

```python
# src/domain/services/dynamic_pricing.py
class DynamicSwitch:
    """Ajusta umbrales dinámicamente."""
    
    def __init__(self, playbook_name: str):
        self.playbook = PLAYBOOKS[playbook_name]
        self.conditions = []
    
    def add_condition(self, condition):
        self.conditions.append(condition)
    
    def adjusted_threshold(self, base_threshold: str) -> float:
        """
        Ajusta umbral dinámicamente.
        Ejemplo: green=0.35 con DemandCondition(0.10) → 0.385
        """
        base = self.playbook[base_threshold]
        adjustment = 1.0
        
        for condition in self.conditions:
            adjustment *= condition.factor
        
        return base * adjustment

# ⚠️ PROBLEMA: ¿Cómo mantener compatibilidad?
# Si DynamicSwitch cambia thresholds, rompe evaluación de health actual
```

### **Solución: Feature Flag + Backward Compatible**

```python
# src/shared/config.py
import os

FEATURE_FLAGS = {
    "USE_DYNAMIC_PRICING": os.getenv("USE_DYNAMIC_PRICING", "false").lower() == "true",
    "DYNAMIC_PRICING_BETA_USERS": ["tenant-123", "tenant-456"]
}

# src/domain/services/health_evaluator.py
class HealthEvaluator:
    """
    Evalúa health de margen.
    Compatible con playbooks estáticos Y dynamic pricing.
    """
    
    @staticmethod
    def evaluate(margin_pct: float, playbook_name: str = "General", 
                 tenant_id: str = None) -> HealthStatus:
        """
        Evalúa health con soporte opcional para dynamic pricing.
        """
        from shared.config import FEATURE_FLAGS, PLAYBOOKS
        
        # Si feature flag está activo Y tenant está en beta
        if (FEATURE_FLAGS["USE_DYNAMIC_PRICING"] and 
            tenant_id in FEATURE_FLAGS["DYNAMIC_PRICING_BETA_USERS"]):
            
            # Usar DynamicSwitch
            switch = DynamicSwitch(playbook_name, tenant_id)
            green_threshold = switch.adjusted_threshold("green")
            yellow_threshold = switch.adjusted_threshold("yellow")
        else:
            # ✅ Usar playbook estático (comportamiento actual)
            playbook = PLAYBOOKS[playbook_name]
            green_threshold = playbook["green"]
            yellow_threshold = playbook["yellow"]
        
        # Lógica de evaluación (igual para ambos casos)
        if margin_pct >= green_threshold:
            return HealthStatus.GREEN
        elif margin_pct >= yellow_threshold:
            return HealthStatus.YELLOW
        else:
            return HealthStatus.RED

# Uso (backward compatible)
health = HealthEvaluator.evaluate(
    margin_pct=30.5,
    playbook_name="General",
    tenant_id="tenant-123"  # Opcional
)
```

### **Tests de Compatibilidad:**

```python
def test_health_evaluator_without_dynamic_pricing():
    """Sin dynamic pricing, debe comportarse como antes."""
    # Desactivar feature flag
    os.environ["USE_DYNAMIC_PRICING"] = "false"
    
    # Evaluar con playbook estático
    health = HealthEvaluator.evaluate(
        margin_pct=30.5,
        playbook_name="General"
    )
    
    # Debe seguir lógica original
    assert health == HealthStatus.YELLOW  # 30.5% < 35% (green threshold)

def test_health_evaluator_with_dynamic_pricing():
    """Con dynamic pricing, debe ajustar thresholds."""
    # Activar feature flag
    os.environ["USE_DYNAMIC_PRICING"] = "true"
    
    # Tenant beta con condiciones de mercado
    health = HealthEvaluator.evaluate(
        margin_pct=30.5,
        playbook_name="General",
        tenant_id="tenant-123"
    )
    
    # Con DemandCondition(-0.10), green threshold baja de 35% a 31.5%
    # Ahora 30.5% podría ser amarillo o verde según condiciones
    assert health in [HealthStatus.YELLOW, HealthStatus.GREEN]
```

### **Criterios de Éxito:**

- ✅ Playbooks estáticos siguen funcionando igual
- ✅ DynamicSwitch solo afecta tenants en beta
- ✅ Feature flag permite activar/desactivar sin deploy
- ✅ No rompe evaluaciones de health existentes

### **Tiempo Estimado:** 2-3 días
### **Riesgo si falla:** 🔴 MEDIO - Evaluaciones incorrectas de health

---

## ⏱️ Timeline de los 5 Retos

```
Semana 1-2:  Reto #1 (Money con Decimal) + Reto #2 (calculate_item_node)
Semana 3:    Reto #3 (session_state) + Reto #4 (PostgreSQL serialization)
Semana 4:    Reto #5 (DynamicSwitch) + Buffer para bugs

Total: 3-4 semanas de trabajo intenso
```

---

## ✅ Criterios Globales de Éxito

### **Antes de declarar "Listo":**

1. ✅ **Zero Regression:**
   - 100% de tests de regresión pasan
   - cálculos dan exactamente los mismos resultados que antes
   - No hay diferencias en 10,000 cálculos de producción

2. ✅ **Shadow Mode Exitoso:**
   - 1-2 semanas en producción sin errores
   - Logs muestran 0 discrepancias entre legacy y new

3. ✅ **Performance Aceptable:**
   - No más de 50% de degradación (idealmente <20%)
   - Memory footprint no aumenta más de 30%

4. ✅ **Backward Compatible:**
   - Código legacy sigue funcionando
   - Datos existentes en DB no requieren migración forzosa
   - Streamlit UI funciona sin cambios visibles

5. ✅ **Rollback Ready:**
   - Feature flags permiten volver a legacy en <5 minutos
   - No hay cambios irreversibles en DB schema

---

## 🚨 Red Flags: Cuándo ABORTAR

Si encuentran alguno de estos problemas, **DETENER inmediatamente:**

1. 🚫 Diferencias en cálculos de más de 0.01% en más de 10 casos
2. 🚫 Performance degrada más de 100%
3. 🚫 No pueden hacer rollback limpio
4. 🚫 Tests de regresión fallan en >5% de casos
5. 🚫 Pérdida de precisión decimal en cualquier escenario

---

## 📚 Apéndice: Herramientas Recomendadas

### **Para Testing:**
- `pytest` con `pytest-xdist` (tests paralelos)
- `hypothesis` (property-based testing para encontrar edge cases)
- `pytest-benchmark` (performance testing)

### **Para Shadow Mode:**
- `structlog` (logging estructurado para comparaciones)
- `datadog` o `sentry` (monitoreo de discrepancias en producción)

### **Para Migrations:**
- `alembic` (si deciden usar migrations más sofisticadas)
- Feature flags: `unleash` o `flagsmith`

---

**Última actualización:** 5 de Febrero, 2026  
**Mantenedor:** GitHub Copilot  
**Review Cycle:** Cada semana durante refactorización
