"""
Módulo de cálculos automáticos para líneas de cotización.

Maneja la lógica de recálculo automático cuando cambia alguno de los siguientes atributos:
- Precio unitario (price_unit)
- Costo unitario (cost_unit)
- Margen porcentual (margin_pct)
- Cantidad (quantity)

Las relaciones son:
- margin_pct = ((price_unit - cost_unit) / price_unit) * 100
- price_unit = cost_unit / (1 - margin_pct / 100)
- cost_unit = price_unit * (1 - margin_pct / 100)
- total_price = price_unit * quantity
- total_cost = cost_unit * quantity
"""

def calculate_from_price_and_cost(price_unit, cost_unit, quantity=1):
    """
    Calcula el margen a partir del precio y costo unitario.
    
    Args:
        price_unit: Precio unitario
        cost_unit: Costo unitario
        quantity: Cantidad (default: 1)
    
    Returns:
        dict con todos los valores calculados
    """
    if price_unit <= 0:
        raise ValueError("El precio debe ser mayor a 0")
    
    margin_pct = ((price_unit - cost_unit) / price_unit) * 100
    
    return {
        "price_unit": round(price_unit, 2),
        "cost_unit": round(cost_unit, 2),
        "margin_pct": round(margin_pct, 2),
        "quantity": int(quantity),
        "total_price": round(price_unit * quantity, 2),
        "total_cost": round(cost_unit * quantity, 2),
        "total_margin_pct": round(margin_pct, 2)  # El margen % no cambia con la cantidad
    }

def calculate_from_price_and_margin(price_unit, margin_pct, quantity=1):
    """
    Calcula el costo a partir del precio y margen.
    
    Args:
        price_unit: Precio unitario
        margin_pct: Margen porcentual (0-100)
        quantity: Cantidad (default: 1)
    
    Returns:
        dict con todos los valores calculados
    """
    if price_unit <= 0:
        raise ValueError("El precio debe ser mayor a 0")
    if margin_pct < 0 or margin_pct >= 100:
        raise ValueError("El margen debe estar entre 0 y 99.99%")
    
    cost_unit = price_unit * (1 - margin_pct / 100)
    
    return {
        "price_unit": round(price_unit, 2),
        "cost_unit": round(cost_unit, 2),
        "margin_pct": round(margin_pct, 2),
        "quantity": int(quantity),
        "total_price": round(price_unit * quantity, 2),
        "total_cost": round(cost_unit * quantity, 2),
        "total_margin_pct": round(margin_pct, 2)
    }

def calculate_from_cost_and_margin(cost_unit, margin_pct, quantity=1):
    """
    Calcula el precio a partir del costo y margen.
    
    Args:
        cost_unit: Costo unitario
        margin_pct: Margen porcentual (0-100)
        quantity: Cantidad (default: 1)
    
    Returns:
        dict con todos los valores calculados
    """
    if cost_unit < 0:
        raise ValueError("El costo no puede ser negativo")
    if margin_pct < 0 or margin_pct >= 100:
        raise ValueError("El margen debe estar entre 0 y 99.99%")
    
    price_unit = cost_unit / (1 - margin_pct / 100)
    
    return {
        "price_unit": round(price_unit, 2),
        "cost_unit": round(cost_unit, 2),
        "margin_pct": round(margin_pct, 2),
        "quantity": int(quantity),
        "total_price": round(price_unit * quantity, 2),
        "total_cost": round(cost_unit * quantity, 2),
        "total_margin_pct": round(margin_pct, 2)
    }

def update_with_quantity_change(price_unit, cost_unit, margin_pct, new_quantity):
    """
    Actualiza los totales cuando cambia la cantidad.
    Los valores unitarios y el margen porcentual se mantienen constantes.
    
    Args:
        price_unit: Precio unitario actual
        cost_unit: Costo unitario actual
        margin_pct: Margen porcentual actual
        new_quantity: Nueva cantidad
    
    Returns:
        dict con todos los valores actualizados
    """
    if new_quantity <= 0:
        raise ValueError("La cantidad debe ser mayor a 0")
    
    return {
        "price_unit": round(price_unit, 2),
        "cost_unit": round(cost_unit, 2),
        "margin_pct": round(margin_pct, 2),
        "quantity": int(new_quantity),
        "total_price": round(price_unit * new_quantity, 2),
        "total_cost": round(cost_unit * new_quantity, 2),
        "total_margin_pct": round(margin_pct, 2)
    }

def recalculate_line(changed_field, **kwargs):
    """
    Función principal que determina qué campos recalcular según el campo que cambió.
    
    Args:
        changed_field: Campo que cambió ('price', 'cost', 'margin', 'quantity')
        **kwargs: Valores actuales de los campos
    
    Returns:
        dict con todos los valores recalculados
    
    Example:
        # Usuario cambió el precio
        result = recalculate_line('price', price_unit=100, cost_unit=80, quantity=2)
        # Resultado: margin_pct se recalcula, totales se actualizan
        
        # Usuario cambió el margen
        result = recalculate_line('margin', price_unit=100, margin_pct=30, quantity=1)
        # Resultado: cost_unit se recalcula
    """
    quantity = kwargs.get('quantity', 1)
    
    if changed_field == 'price':
        # Si cambió el precio, recalcular margen a partir de precio y costo
        price_unit = kwargs.get('price_unit')
        cost_unit = kwargs.get('cost_unit')
        return calculate_from_price_and_cost(price_unit, cost_unit, quantity)
    
    elif changed_field == 'cost':
        # Si cambió el costo, recalcular margen a partir de precio y costo
        price_unit = kwargs.get('price_unit')
        cost_unit = kwargs.get('cost_unit')
        return calculate_from_price_and_cost(price_unit, cost_unit, quantity)
    
    elif changed_field == 'margin':
        # Si cambió el margen, necesitamos saber si hay precio o costo
        price_unit = kwargs.get('price_unit')
        cost_unit = kwargs.get('cost_unit')
        margin_pct = kwargs.get('margin_pct')
        
        if price_unit and price_unit > 0:
            # Recalcular costo a partir de precio y margen
            return calculate_from_price_and_margin(price_unit, margin_pct, quantity)
        elif cost_unit and cost_unit >= 0:
            # Recalcular precio a partir de costo y margen
            return calculate_from_cost_and_margin(cost_unit, margin_pct, quantity)
        else:
            raise ValueError("Se necesita precio o costo para recalcular con margen")
    
    elif changed_field == 'quantity':
        # Si cambió la cantidad, mantener valores unitarios y recalcular totales
        price_unit = kwargs.get('price_unit')
        cost_unit = kwargs.get('cost_unit')
        margin_pct = kwargs.get('margin_pct')
        return update_with_quantity_change(price_unit, cost_unit, margin_pct, quantity)
    
    else:
        raise ValueError(f"Campo desconocido: {changed_field}")
