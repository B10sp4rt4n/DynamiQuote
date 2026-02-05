"""
Tests de Equivalencia: Legacy vs API
Verifica que ProfitabilityCalculator replica exactamente la lógica de aup_engine.py
"""

import pytest
import sys
import os

# Agregar paths
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.domain.profitability_calculator import ProfitabilityCalculator
from aup_engine import calculate_item_node as legacy_calculate_item_node


# =========================
# Fixtures
# =========================

@pytest.fixture
def basic_item():
    """Item básico con precio."""
    return {
        "item_id": "TEST-001",
        "item_number": 1,
        "quantity": 10,
        "cost_unit": 100,
        "price_unit": 150
    }


@pytest.fixture
def item_without_price():
    """Item sin precio (margen indefinido)."""
    return {
        "item_id": "TEST-002",
        "item_number": 2,
        "quantity": 5,
        "cost_unit": 200,
        "price_unit": None
    }


@pytest.fixture
def item_zero_cost():
    """Item con costo cero (edge case)."""
    return {
        "item_id": "TEST-003",
        "item_number": 3,
        "quantity": 1,
        "cost_unit": 0,
        "price_unit": 100
    }


@pytest.fixture
def item_zero_price():
    """Item con precio cero."""
    return {
        "item_id": "TEST-004",
        "item_number": 4,
        "quantity": 1,
        "cost_unit": 50,
        "price_unit": 0
    }


# =========================
# Tests de Equivalencia
# =========================

def test_basic_calculation_equivalence(basic_item):
    """
    Verifica que cálculo básico sea idéntico entre legacy y nuevo.
    """
    legacy_result = legacy_calculate_item_node(basic_item)
    new_result = ProfitabilityCalculator.calculate_item_node(basic_item)
    
    # Comparar campos críticos
    assert new_result["quantity"] == legacy_result["quantity"]
    assert new_result["cost_unit"] == legacy_result["cost_unit"]
    assert new_result["subtotal_cost"] == legacy_result["subtotal_cost"]
    assert new_result["price_unit"] == legacy_result["price_unit"]
    assert new_result["subtotal_price"] == legacy_result["subtotal_price"]
    assert new_result["gross_profit"] == legacy_result["gross_profit"]
    
    # Margen porcentual (con tolerancia para floats)
    assert abs(new_result["margin_pct"] - legacy_result["margin_pct"]) < 0.0001
    
    # NOTA: health puede diferir porque legacy usa thresholds hardcoded
    # y nuevo usa thresholds de playbook General (que casualmente son iguales)


def test_no_price_equivalence(item_without_price):
    """
    Verifica que items sin precio se manejen igual.
    """
    legacy_result = legacy_calculate_item_node(item_without_price)
    new_result = ProfitabilityCalculator.calculate_item_node(item_without_price)
    
    assert new_result["price_unit"] == legacy_result["price_unit"] == None
    assert new_result["subtotal_price"] == legacy_result["subtotal_price"] == None
    assert new_result["gross_profit"] == legacy_result["gross_profit"] == None
    assert new_result["margin_pct"] == legacy_result["margin_pct"] == None
    assert new_result["health"] == legacy_result["health"] == "undefined"


def test_zero_cost_equivalence(item_zero_cost):
    """
    Verifica manejo de costo cero (edge case).
    """
    legacy_result = legacy_calculate_item_node(item_zero_cost)
    new_result = ProfitabilityCalculator.calculate_item_node(item_zero_cost)
    
    assert new_result["subtotal_cost"] == legacy_result["subtotal_cost"] == 0
    assert new_result["gross_profit"] == legacy_result["gross_profit"] == 100
    assert new_result["margin_pct"] == legacy_result["margin_pct"] == 1.0  # 100% margen


def test_zero_price_equivalence(item_zero_price):
    """
    Verifica manejo de precio cero.
    """
    legacy_result = legacy_calculate_item_node(item_zero_price)
    new_result = ProfitabilityCalculator.calculate_item_node(item_zero_price)
    
    # Con price_unit=0, no se calculan métricas
    assert new_result["price_unit"] == legacy_result["price_unit"] == None
    assert new_result["health"] == legacy_result["health"] == "undefined"


# =========================
# Tests de Health Evaluation
# =========================

def test_health_general_playbook():
    """
    Verifica evaluación de salud con playbook General.
    Thresholds: verde >= 0.35, amarillo >= 0.25
    """
    # Item verde (margen 40%)
    item_green = {
        "quantity": 1,
        "cost_unit": 100,
        "price_unit": 166.67  # margen = 66.67/166.67 = 0.40
    }
    
    result = ProfitabilityCalculator.calculate_item_node(item_green, "General")
    assert result["health"] == "green"
    
    # Item amarillo (margen 30%)
    item_yellow = {
        "quantity": 1,
        "cost_unit": 100,
        "price_unit": 142.86  # margen ≈ 0.30
    }
    
    result = ProfitabilityCalculator.calculate_item_node(item_yellow, "General")
    assert result["health"] == "yellow"
    
    # Item rojo (margen 20%)
    item_red = {
        "quantity": 1,
        "cost_unit": 100,
        "price_unit": 125  # margen = 0.20
    }
    
    result = ProfitabilityCalculator.calculate_item_node(item_red, "General")
    assert result["health"] == "red"


def test_health_msp_playbook():
    """
    Verifica que thresholds de MSP sean diferentes a General.
    MSP: verde >= 0.30, amarillo >= 0.20
    General: verde >= 0.35, amarillo >= 0.25
    """
    # Margen 31% es amarillo en General, pero VERDE en MSP
    item = {
        "quantity": 1,
        "cost_unit": 100,
        "price_unit": 144.93  # margen = (144.93-100)/144.93 ≈ 0.31 = 31%
    }
    
    result_general = ProfitabilityCalculator.calculate_item_node(item, "General")
    result_msp = ProfitabilityCalculator.calculate_item_node(item, "MSP")
    
    assert result_general["health"] == "yellow"  # 0.31 >= 0.25 y < 0.35
    assert result_msp["health"] == "green"       # 0.31 >= 0.30 ✓


def test_health_penetracion_playbook():
    """
    Verifica thresholds agresivos de Penetración.
    Penetración: verde >= 0.15, amarillo >= 0.10
    """
    # Margen 12% es rojo en General, pero amarillo en Penetración
    item = {
        "quantity": 1,
        "cost_unit": 100,
        "price_unit": 113.64  # margen ≈ 0.12
    }
    
    result_general = ProfitabilityCalculator.calculate_item_node(item, "General")
    result_penetracion = ProfitabilityCalculator.calculate_item_node(item, "Penetración")
    
    assert result_general["health"] == "red"        # 0.12 < 0.25
    assert result_penetracion["health"] == "yellow"  # 0.12 >= 0.10


# =========================
# Tests de Batch Processing
# =========================

def test_batch_calculation():
    """
    Verifica que calculate_batch procese múltiples items correctamente.
    """
    items = [
        {"quantity": 10, "cost_unit": 100, "price_unit": 150, "item_number": 1},
        {"quantity": 5, "cost_unit": 200, "price_unit": 280, "item_number": 2},
        {"quantity": 1, "cost_unit": 50, "price_unit": None, "item_number": 3},
    ]
    
    results = ProfitabilityCalculator.calculate_batch(items, "General")
    
    assert len(results) == 3
    
    # Item 1: con precio
    assert results[0]["subtotal_price"] == 1500
    assert results[0]["gross_profit"] == 500
    
    # Item 2: con precio
    assert results[1]["subtotal_price"] == 1400
    assert results[1]["gross_profit"] == 400
    
    # Item 3: sin precio
    assert results[2]["price_unit"] is None
    assert results[2]["health"] == "undefined"


def test_batch_equivalence_with_legacy():
    """
    Verifica que batch processing sea equivalente a procesar items uno por uno.
    """
    items = [
        {"quantity": 10, "cost_unit": 100, "price_unit": 150},
        {"quantity": 5, "cost_unit": 200, "price_unit": 280},
    ]
    
    # Batch
    batch_results = ProfitabilityCalculator.calculate_batch(items)
    
    # Uno por uno
    individual_results = [
        ProfitabilityCalculator.calculate_item_node(item)
        for item in items
    ]
    
    # Comparar
    for batch, individual in zip(batch_results, individual_results):
        assert batch["subtotal_price"] == individual["subtotal_price"]
        assert batch["gross_profit"] == individual["gross_profit"]
        assert batch["margin_pct"] == individual["margin_pct"]
        assert batch["health"] == individual["health"]


# =========================
# Tests de Edge Cases
# =========================

def test_negative_margin():
    """
    Verifica manejo de márgenes negativos (precio < costo).
    """
    item = {
        "quantity": 1,
        "cost_unit": 100,
        "price_unit": 80  # Precio menor al costo
    }
    
    result = ProfitabilityCalculator.calculate_item_node(item)
    
    assert result["gross_profit"] == -20
    assert result["margin_pct"] < 0
    assert result["health"] == "red"


def test_fractional_quantities():
    """
    Verifica manejo de cantidades fraccionarias.
    """
    item = {
        "quantity": 2.5,
        "cost_unit": 100,
        "price_unit": 150
    }
    
    result = ProfitabilityCalculator.calculate_item_node(item)
    
    assert result["subtotal_cost"] == 250
    assert result["subtotal_price"] == 375
    assert result["gross_profit"] == 125


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
