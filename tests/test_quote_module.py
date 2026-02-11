"""
Tests básicos para el módulo quote

Ejecutar con: python -m pytest tests/test_quote_module.py -v
"""

import pytest
from quote import (
    QuoteState,
    calculate_margin,
    calculate_price_from_margin,
    calculate_line_subtotals,
    calculate_quote_totals,
    ValidationError,
    validate_sku,
    validate_description,
    validate_quantity,
    validate_line
)


# =========================
# Tests de Calculations
# =========================

def test_calculate_margin():
    """Test cálculo de margen."""
    assert calculate_margin(100, 150) == 33.33
    assert calculate_margin(100, 200) == 50.0
    assert calculate_margin(100, 100) == 0.0
    assert calculate_margin(100, 0) == 0.0


def test_calculate_price_from_margin():
    """Test cálculo de precio dado margen."""
    price = calculate_price_from_margin(100, 33.33)
    assert 149 < price < 150
    
    assert calculate_price_from_margin(100, 50) == 200.0
    
    with pytest.raises(ValueError):
        calculate_price_from_margin(100, 100)
    
    with pytest.raises(ValueError):
        calculate_price_from_margin(100, -10)


def test_calculate_line_subtotals():
    """Test cálculo de subtotales de línea."""
    line = {
        "quantity": 10,
        "cost_unit": 100,
        "final_price_unit": 150
    }
    
    subtotals = calculate_line_subtotals(line)
    
    assert subtotals["subtotal_cost"] == 1000
    assert subtotals["subtotal_price"] == 1500
    assert subtotals["gross_profit"] == 500
    assert subtotals["margin_pct"] == 33.33


def test_calculate_quote_totals():
    """Test cálculo de totales consolidados."""
    lines = [
        {"quantity": 10, "cost_unit": 100, "final_price_unit": 150},
        {"quantity": 5, "cost_unit": 200, "final_price_unit": 300}
    ]
    
    totals = calculate_quote_totals(lines)
    
    assert totals["total_cost"] == 2000
    assert totals["total_revenue"] == 3000
    assert totals["gross_profit"] == 1000
    assert totals["line_count"] == 2


# =========================
# Tests de Validators
# =========================

def test_validate_sku():
    """Test validación de SKU."""
    assert validate_sku("  ABC123  ") == "ABC123"
    assert validate_sku("", required=False) is None
    
    with pytest.raises(ValidationError):
        validate_sku("", required=True)


def test_validate_description():
    """Test validación de descripción."""
    assert validate_description("  Test desc  ") == "Test desc"
    
    with pytest.raises(ValidationError):
        validate_description("ab")  # Muy corto
    
    with pytest.raises(ValidationError):
        validate_description("", required=True)


def test_validate_quantity():
    """Test validación de cantidad."""
    assert validate_quantity(10) == 10.0
    assert validate_quantity("5.5") == 5.5
    
    with pytest.raises(ValidationError):
        validate_quantity(0)
    
    with pytest.raises(ValidationError):
        validate_quantity(-1)


def test_validate_line():
    """Test validación de línea completa."""
    line = {
        "sku": "  ABC123  ",
        "description": "Producto test",
        "quantity": "10",
        "cost_unit": "100",
        "final_price_unit": "150"
    }
    
    validated = validate_line(line)
    
    assert validated["sku"] == "ABC123"
    assert validated["description"] == "Producto test"
    assert validated["quantity"] == 10.0
    assert validated["cost_unit"] == 100.0
    assert validated["final_price_unit"] == 150.0


# =========================
# Tests de QuoteState
# =========================

def test_quote_state_initialization():
    """Test inicialización de QuoteState."""
    state = QuoteState()
    
    assert state.quote_id is not None
    assert state.quote_group_id is not None
    assert state.version == 1
    assert state.parent_quote_id is None
    assert len(state.lines) == 0


def test_quote_state_add_line():
    """Test agregar línea."""
    state = QuoteState()
    
    line = {
        "sku": "ABC123",
        "description": "Test product",
        "quantity": 10,
        "cost_unit": 100,
        "final_price_unit": 150
    }
    
    added = state.add_line(line)
    
    assert len(state.lines) == 1
    assert added["line_id"] is not None
    assert added["subtotal_cost"] == 1000
    assert added["subtotal_price"] == 1500


def test_quote_state_calculate_totals():
    """Test cálculo de totales."""
    state = QuoteState()
    
    state.add_line({
        "sku": "ABC1",
        "description": "Product 1",
        "quantity": 10,
        "cost_unit": 100,
        "final_price_unit": 150
    })
    
    state.add_line({
        "sku": "ABC2",
        "description": "Product 2",
        "quantity": 5,
        "cost_unit": 200,
        "final_price_unit": 300
    })
    
    totals = state.calculate_totals()
    
    assert totals["total_cost"] == 2000
    assert totals["total_revenue"] == 3000
    assert totals["line_count"] == 2


def test_quote_state_remove_line():
    """Test eliminar línea."""
    state = QuoteState()
    
    state.add_line({
        "sku": "ABC1",
        "description": "Product 1",
        "quantity": 10,
        "cost_unit": 100,
        "final_price_unit": 150
    })
    
    state.add_line({
        "sku": "ABC2",
        "description": "Product 2",
        "quantity": 5,
        "cost_unit": 200,
        "final_price_unit": 300
    })
    
    assert len(state) == 2
    
    removed = state.remove_line(0)
    assert removed["sku"] == "ABC1"
    assert len(state) == 1


def test_quote_state_derive_version():
    """Test derivar nueva versión."""
    state = QuoteState()
    
    state.add_line({
        "sku": "ABC1",
        "description": "Product 1",
        "quantity": 10,
        "cost_unit": 100,
        "final_price_unit": 150
    })
    
    state.metadata["proposal_name"] = "Test Proposal"
    
    new_version = state.derive_new_version()
    
    assert new_version.version == 2
    assert new_version.parent_quote_id == state.quote_id
    assert new_version.quote_group_id == state.quote_group_id
    assert len(new_version.lines) == len(state.lines)
    assert new_version.metadata["proposal_name"] == "Test Proposal"


def test_quote_state_serialization():
    """Test serialización a dict."""
    state = QuoteState()
    
    state.add_line({
        "sku": "ABC1",
        "description": "Product 1",
        "quantity": 10,
        "cost_unit": 100,
        "final_price_unit": 150
    })
    
    data = state.to_dict()
    
    assert "quote_id" in data
    assert "lines" in data
    assert "totals" in data
    assert len(data["lines"]) == 1
    
    # Reconstruir desde dict
    restored = QuoteState.from_dict(data)
    
    assert restored.quote_id == state.quote_id
    assert len(restored.lines) == len(state.lines)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
