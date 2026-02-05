"""
Modelos Pydantic para la API de DynamiQuote.
Define contratos de datos entre frontend y backend.
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, List
from decimal import Decimal


class ItemInput(BaseModel):
    """
    Datos de entrada para calcular un item.
    price_unit es ENTRADA, no se calcula desde margen.
    """
    item_id: Optional[str] = None
    item_number: Optional[int] = None
    quantity: float = Field(gt=0, description="Cantidad de unidades (debe ser > 0)")
    cost_unit: float = Field(ge=0, description="Costo unitario")
    price_unit: Optional[float] = Field(None, ge=0, description="Precio unitario (entrada)")
    
    @validator('quantity', 'cost_unit')
    def validate_positive_numbers(cls, v, field):
        if v < 0:
            raise ValueError(f"{field.name} no puede ser negativo")
        return v


class ItemNode(BaseModel):
    """
    Nodo calculado de un item con todas las métricas de rentabilidad.
    """
    item_id: Optional[str]
    item_number: Optional[int]
    quantity: float
    cost_unit: float
    subtotal_cost: float
    price_unit: Optional[float]
    subtotal_price: Optional[float]
    gross_profit: Optional[float]
    margin_pct: Optional[float]
    health: str  # 'green', 'yellow', 'red', 'undefined'
    
    class Config:
        json_schema_extra = {
            "example": {
                "item_id": "ABC123",
                "item_number": 1,
                "quantity": 10.0,
                "cost_unit": 100.0,
                "subtotal_cost": 1000.0,
                "price_unit": 150.0,
                "subtotal_price": 1500.0,
                "gross_profit": 500.0,
                "margin_pct": 0.3333,
                "health": "yellow"
            }
        }


class BatchCalculateRequest(BaseModel):
    """
    Request para calcular múltiples items en batch.
    Optimización para reducir llamadas HTTP (N+1).
    """
    items: List[ItemInput] = Field(..., min_length=1, max_length=1000)
    playbook_name: str = Field(default="General", description="Playbook a usar")
    
    @validator('playbook_name')
    def validate_playbook(cls, v):
        valid_playbooks = ["General", "MSP", "SaaS", "Construcción", "Gobierno", "Penetración"]
        if v not in valid_playbooks:
            raise ValueError(f"Playbook debe ser uno de: {valid_playbooks}")
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "playbook_name": "General",
                "items": [
                    {
                        "item_number": 1,
                        "quantity": 10,
                        "cost_unit": 100,
                        "price_unit": 150
                    },
                    {
                        "item_number": 2,
                        "quantity": 5,
                        "cost_unit": 200,
                        "price_unit": 280
                    }
                ]
            }
        }


class BatchCalculateResponse(BaseModel):
    """Response con nodos calculados."""
    nodes: List[ItemNode]
    total_items: int
    playbook_used: str
    
    class Config:
        json_schema_extra = {
            "example": {
                "playbook_used": "General",
                "total_items": 2,
                "nodes": [
                    {
                        "item_number": 1,
                        "quantity": 10.0,
                        "cost_unit": 100.0,
                        "subtotal_cost": 1000.0,
                        "price_unit": 150.0,
                        "subtotal_price": 1500.0,
                        "gross_profit": 500.0,
                        "margin_pct": 0.3333,
                        "health": "yellow"
                    }
                ]
            }
        }


class PlaybookInfo(BaseModel):
    """Información de un playbook."""
    name: str
    description: str
    green_threshold: float
    yellow_threshold: float
    red_threshold: float
    max_red_for_green: float
    max_red_for_yellow: float
    weights: dict


class PlaybooksResponse(BaseModel):
    """Response con todos los playbooks disponibles."""
    playbooks: List[PlaybookInfo]
    total: int
