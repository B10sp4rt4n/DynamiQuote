"""
Quote Management Module

Este módulo centraliza la gestión de estado, cálculos y validaciones
para el cotizador legacy de DynamiQuote.
"""

from .state import QuoteState
from .calculations import (
    calculate_margin,
    calculate_price_from_margin,
    calculate_line_subtotals,
    calculate_quote_totals
)
from .validators import (
    ValidationError,
    validate_sku,
    validate_description,
    validate_quantity,
    validate_cost,
    validate_price,
    validate_line
)

__all__ = [
    # State management
    "QuoteState",
    
    # Calculations
    "calculate_margin",
    "calculate_price_from_margin",
    "calculate_line_subtotals",
    "calculate_quote_totals",
    
    # Validators
    "ValidationError",
    "validate_sku",
    "validate_description",
    "validate_quantity",
    "validate_cost",
    "validate_price",
    "validate_line",
]
