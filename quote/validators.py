"""
Validators Module

Validadores centralizados para datos de cotizaciones.
Proporciona consistencia en manejo de errores y reglas de negocio.
"""

from typing import Dict, Any, Optional


class ValidationError(Exception):
    """Error de validación de datos."""
    pass


def validate_sku(sku: Optional[str], required: bool = True) -> Optional[str]:
    """
    Validar SKU.
    
    Args:
        sku: Código SKU
        required: Si el SKU es obligatorio
        
    Returns:
        SKU limpio o None si es opcional y vacío
        
    Raises:
        ValidationError: Si el SKU es inválido
        
    Examples:
        >>> validate_sku("  ABC123  ")
        'ABC123'
        >>> validate_sku("", required=False)
        None
        >>> validate_sku("", required=True)
        ValidationError: SKU es obligatorio
    """
    if sku is None or not str(sku).strip():
        if required:
            raise ValidationError("SKU es obligatorio")
        return None
    
    cleaned = str(sku).strip()
    
    # Validaciones adicionales opcionales:
    # - Longitud máxima
    # - Caracteres permitidos
    # - Formato específico
    
    return cleaned


def validate_description(description: Optional[str], required: bool = True) -> Optional[str]:
    """
    Validar descripción.
    
    Args:
        description: Texto descriptivo
        required: Si la descripción es obligatoria
        
    Returns:
        Descripción limpia
        
    Raises:
        ValidationError: Si la descripción es inválida
    """
    if description is None or not str(description).strip():
        if required:
            raise ValidationError("Descripción es obligatoria")
        return None
    
    cleaned = str(description).strip()
    
    # Validación de longitud mínima (opcional)
    if len(cleaned) < 3:
        raise ValidationError("Descripción debe tener al menos 3 caracteres")
    
    return cleaned


def validate_quantity(quantity: Any, min_value: float = 0.01) -> float:
    """
    Validar cantidad.
    
    Args:
        quantity: Cantidad a validar
        min_value: Valor mínimo permitido
        
    Returns:
        Cantidad como float
        
    Raises:
        ValidationError: Si la cantidad es inválida
        
    Examples:
        >>> validate_quantity(10)
        10.0
        >>> validate_quantity("5.5")
        5.5
        >>> validate_quantity(0)
        ValidationError: Cantidad debe ser mayor a 0.01
        >>> validate_quantity(-1)
        ValidationError: Cantidad debe ser mayor a 0.01
    """
    try:
        qty = float(quantity)
    except (TypeError, ValueError):
        raise ValidationError(f"Cantidad inválida: {quantity}")
    
    if qty < min_value:
        raise ValidationError(f"Cantidad debe ser mayor a {min_value}")
    
    return qty


def validate_cost(cost: Any, allow_zero: bool = True) -> float:
    """
    Validar costo unitario.
    
    Args:
        cost: Costo a validar
        allow_zero: Si se permite costo cero
        
    Returns:
        Costo como float
        
    Raises:
        ValidationError: Si el costo es inválido
    """
    try:
        cost_value = float(cost)
    except (TypeError, ValueError):
        raise ValidationError(f"Costo inválido: {cost}")
    
    if cost_value < 0:
        raise ValidationError("Costo no puede ser negativo")
    
    if not allow_zero and cost_value == 0:
        raise ValidationError("Costo no puede ser cero")
    
    return cost_value


def validate_price(price: Any, cost: Optional[float] = None, allow_zero: bool = False) -> Optional[float]:
    """
    Validar precio unitario.
    
    Args:
        price: Precio a validar
        cost: Costo para comparación (opcional)
        allow_zero: Si se permite precio cero
        
    Returns:
        Precio como float o None si es vacío/opcional
        
    Raises:
        ValidationError: Si el precio es inválido
    """
    if price is None or price == "":
        return None
    
    try:
        price_value = float(price)
    except (TypeError, ValueError):
        raise ValidationError(f"Precio inválido: {price}")
    
    if price_value < 0:
        raise ValidationError("Precio no puede ser negativo")
    
    if not allow_zero and price_value == 0:
        raise ValidationError("Precio no puede ser cero")
    
    # Advertencia si precio < costo (margen negativo)
    if cost is not None and price_value < cost:
        # No lanzar error, solo retornar para que el llamador maneje la advertencia
        pass
    
    return price_value


def validate_margin(margin_pct: Any) -> Optional[float]:
    """
    Validar margen objetivo.
    
    Args:
        margin_pct: Margen en porcentaje
        
    Returns:
        Margen como float o None
        
    Raises:
        ValidationError: Si el margen es inválido
    """
    if margin_pct is None or margin_pct == "":
        return None
    
    try:
        margin = float(margin_pct)
    except (TypeError, ValueError):
        raise ValidationError(f"Margen inválido: {margin_pct}")
    
    if margin < 0:
        raise ValidationError("Margen no puede ser negativo")
    
    if margin >= 100:
        raise ValidationError("Margen debe ser menor a 100%")
    
    return margin


def validate_line(line: Dict[str, Any], sku_required: bool = True) -> Dict[str, Any]:
    """
    Validar una línea completa de cotización.
    
    Args:
        line: Diccionario con datos de la línea
        sku_required: Si el SKU es obligatorio
        
    Returns:
        Línea validada y limpiada
        
    Raises:
        ValidationError: Si algún campo es inválido
        
    Examples:
        >>> line = {
        ...     "sku": "  ABC123  ",
        ...     "description": "Producto test",
        ...     "quantity": "10",
        ...     "cost_unit": "100.50"
        ... }
        >>> validated = validate_line(line)
        >>> validated["sku"]
        'ABC123'
        >>> validated["quantity"]
        10.0
    """
    validated = {}
    
    # Validar campos obligatorios
    validated["sku"] = validate_sku(line.get("sku"), required=sku_required)
    validated["description"] = validate_description(line.get("description"), required=True)
    validated["quantity"] = validate_quantity(line.get("quantity", 1))
    validated["cost_unit"] = validate_cost(line.get("cost_unit", 0))
    
    # Validar precio (opcional)
    price = validate_price(
        line.get("final_price_unit"),
        cost=validated["cost_unit"],
        allow_zero=False
    )
    validated["final_price_unit"] = price
    
    # Validar margen objetivo (opcional)
    margin = validate_margin(line.get("margin_target"))
    validated["margin_target"] = margin
    
    # Si no hay precio ni margen, advertir
    if price is None and margin is None:
        raise ValidationError("Debe especificar precio unitario o margen objetivo")
    
    # Copiar campos opcionales sin validación estricta
    optional_fields = [
        "line_type",
        "service_origin",
        "strategy",
        "description_original",
        "description_final",
        "description_corrections",
        "corrected_desc",
        "corrections",
        "warnings",
        "line_id",
        "created_at",
        "import_source",
        "import_batch_id"
    ]
    
    for field in optional_fields:
        if field in line:
            validated[field] = line[field]
    
    return validated


def check_duplicate_sku(sku: str, existing_lines: list) -> bool:
    """
    Verificar si un SKU ya existe en las líneas.
    
    Args:
        sku: SKU a verificar
        existing_lines: Lista de líneas existentes
        
    Returns:
        True si el SKU está duplicado
    """
    if not sku:
        return False
    
    existing_skus = [line.get("sku", "").strip().lower() for line in existing_lines]
    return sku.strip().lower() in existing_skus
