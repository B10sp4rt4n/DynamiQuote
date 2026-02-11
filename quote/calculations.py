"""
Financial Calculations Module

Funciones centralizadas para cálculos financieros en cotizaciones.
Elimina duplicación de código y facilita testing.
"""

from typing import Dict, List, Any, Optional


def calculate_margin(cost: float, price: float) -> float:
    """
    Calcular margen porcentual.
    
    Formula: ((precio - costo) / precio) * 100
    
    Args:
        cost: Costo unitario
        price: Precio unitario
        
    Returns:
        Margen en porcentaje (0-100)
        
    Examples:
        >>> calculate_margin(100, 150)
        33.33
        >>> calculate_margin(100, 100)
        0.0
        >>> calculate_margin(100, 0)
        0.0
    """
    if price <= 0:
        return 0.0
    
    margin = ((price - cost) / price) * 100
    return round(margin, 2)


def calculate_price_from_margin(cost: float, margin_pct: float) -> float:
    """
    Calcular precio unitario dado un costo y margen objetivo.
    
    Formula: costo / (1 - margen/100)
    
    Args:
        cost: Costo unitario
        margin_pct: Margen objetivo en porcentaje (0-100)
        
    Returns:
        Precio unitario calculado
        
    Raises:
        ValueError: Si el margen es >= 100% o < 0%
        
    Examples:
        >>> calculate_price_from_margin(100, 33.33)
        149.99
        >>> calculate_price_from_margin(100, 50)
        200.0
    """
    if margin_pct >= 100:
        raise ValueError("Margen objetivo debe ser menor a 100%")
    
    if margin_pct < 0:
        raise ValueError("Margen objetivo no puede ser negativo")
    
    if cost < 0:
        raise ValueError("Costo no puede ser negativo")
    
    price = cost / (1 - margin_pct / 100)
    return round(price, 2)


def calculate_line_subtotals(line: Dict[str, Any]) -> Dict[str, float]:
    """
    Calcular subtotales de una línea de cotización.
    
    Args:
        line: Diccionario con datos de la línea (quantity, cost_unit, final_price_unit)
        
    Returns:
        Diccionario con subtotales:
        - subtotal_cost: cantidad * costo_unitario
        - subtotal_price: cantidad * precio_unitario
        - gross_profit: subtotal_price - subtotal_cost
        - margin_pct: margen porcentual
        
    Examples:
        >>> line = {"quantity": 10, "cost_unit": 100, "final_price_unit": 150}
        >>> calculate_line_subtotals(line)
        {'subtotal_cost': 1000, 'subtotal_price': 1500, 'gross_profit': 500, 'margin_pct': 33.33}
    """
    quantity = float(line.get("quantity", 0))
    cost_unit = float(line.get("cost_unit", 0))
    price_unit = float(line.get("final_price_unit", 0))
    
    subtotal_cost = quantity * cost_unit
    subtotal_price = quantity * price_unit
    gross_profit = subtotal_price - subtotal_cost
    
    # Calcular margen si hay precio
    margin_pct = calculate_margin(cost_unit, price_unit) if price_unit > 0 else None
    
    return {
        "subtotal_cost": round(subtotal_cost, 2),
        "subtotal_price": round(subtotal_price, 2),
        "gross_profit": round(gross_profit, 2),
        "margin_pct": margin_pct
    }


def calculate_quote_totals(lines: List[Dict[str, Any]]) -> Dict[str, float]:
    """
    Calcular totales consolidados de una cotización.
    
    Args:
        lines: Lista de líneas de cotización
        
    Returns:
        Diccionario con totales consolidados:
        - total_cost: suma de costos
        - total_revenue: suma de ingresos
        - gross_profit: utilidad bruta total
        - avg_margin_pct: margen promedio ponderado
        - line_count: número de líneas
        
    Examples:
        >>> lines = [
        ...     {"quantity": 10, "cost_unit": 100, "final_price_unit": 150},
        ...     {"quantity": 5, "cost_unit": 200, "final_price_unit": 300}
        ... ]
        >>> totals = calculate_quote_totals(lines)
        >>> totals["total_cost"]
        2000.0
        >>> totals["total_revenue"]
        3000.0
    """
    if not lines:
        return {
            "total_cost": 0.0,
            "total_revenue": 0.0,
            "gross_profit": 0.0,
            "avg_margin_pct": 0.0,
            "line_count": 0
        }
    
    total_cost = 0.0
    total_revenue = 0.0
    
    for line in lines:
        subtotals = calculate_line_subtotals(line)
        total_cost += subtotals["subtotal_cost"]
        total_revenue += subtotals["subtotal_price"]
    
    gross_profit = total_revenue - total_cost
    
    # Margen promedio ponderado
    avg_margin_pct = calculate_margin(total_cost, total_revenue) if total_revenue > 0 else 0.0
    
    return {
        "total_cost": round(total_cost, 2),
        "total_revenue": round(total_revenue, 2),
        "gross_profit": round(gross_profit, 2),
        "avg_margin_pct": avg_margin_pct,
        "line_count": len(lines)
    }


def calculate_health_status(
    margin_pct: float,
    green_threshold: float = 35.0,
    yellow_threshold: float = 25.0
) -> str:
    """
    Evaluar el estado de salud basado en margen.
    
    Args:
        margin_pct: Margen en porcentaje
        green_threshold: Umbral para estado verde (default: 35%)
        yellow_threshold: Umbral para estado amarillo (default: 25%)
        
    Returns:
        "green", "yellow", o "red"
        
    Examples:
        >>> calculate_health_status(40)
        'green'
        >>> calculate_health_status(30)
        'yellow'
        >>> calculate_health_status(20)
        'red'
    """
    if margin_pct >= green_threshold:
        return "green"
    elif margin_pct >= yellow_threshold:
        return "yellow"
    else:
        return "red"
