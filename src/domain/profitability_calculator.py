"""
Servicio de Dominio: ProfitabilityCalculator
Extrae la lógica de negocio de calculate_item_node() para centralizarla.
Replica EXACTAMENTE la lógica de aup_engine.py con las correcciones necesarias.
"""

from typing import Dict, Any, Optional
from src.config.playbooks import get_playbook


class ProfitabilityCalculator:
    """
    Servicio de dominio para calcular rentabilidad de items individuales.
    Cada línea de cotización es un nodo independiente.
    """

    @staticmethod
    def calculate_item_node(
        item: Dict[str, Any], 
        playbook_name: str = "General"
    ) -> Dict[str, Any]:
        """
        Calcula el nodo de cada item de forma independiente.
        
        Args:
            item: Diccionario con datos del item:
                - quantity: Cantidad de unidades
                - cost_unit: Costo unitario
                - price_unit: Precio unitario (ENTRADA, no calculado)
                - item_id: ID del item (opcional)
                - item_number: Número de línea (opcional)
            playbook_name: Nombre del playbook para thresholds de salud
            
        Returns:
            Diccionario con nodo calculado incluyendo:
            - Todos los campos de entrada
            - subtotal_cost, subtotal_price
            - gross_profit, margin_pct
            - health (basado en thresholds del playbook)
        """
        # Extraer valores de entrada
        quantity = float(item.get("quantity", 0))
        cost_unit = float(item.get("cost_unit", 0))
        price_unit = item.get("price_unit")
        
        # Cálculos básicos del nodo
        subtotal_cost = quantity * cost_unit
        
        # Nodo base
        node = {
            "item_id": item.get("item_id"),
            "item_number": item.get("item_number"),
            "quantity": quantity,
            "cost_unit": cost_unit,
            "subtotal_cost": subtotal_cost,
            "price_unit": None,
            "subtotal_price": None,
            "gross_profit": None,
            "margin_pct": None,
            "health": "undefined"
        }
        
        # Si tiene precio, calcular métricas de rentabilidad
        if price_unit is not None and float(price_unit) > 0:
            price_unit = float(price_unit)
            subtotal_price = quantity * price_unit
            gross_profit = subtotal_price - subtotal_cost
            
            # Margen porcentual (margen sobre precio de venta, NO sobre costo)
            margin_pct = gross_profit / subtotal_price if subtotal_price > 0 else None
            
            # Evaluación de salud usando thresholds del playbook
            health = ProfitabilityCalculator.evaluate_health(
                margin_pct, 
                playbook_name
            )
            
            node.update({
                "price_unit": price_unit,
                "subtotal_price": subtotal_price,
                "gross_profit": gross_profit,
                "margin_pct": margin_pct,
                "health": health
            })
        
        return node

    @staticmethod
    def evaluate_health(
        margin_pct: Optional[float], 
        playbook_name: str = "General"
    ) -> str:
        """
        Evalúa la salud de un item basado en su margen porcentual.
        
        CORRECCIÓN CRÍTICA: Ahora usa los thresholds del playbook seleccionado,
        no thresholds hardcodeados como en el código legacy.
        
        Args:
            margin_pct: Margen porcentual (gross_profit / subtotal_price)
            playbook_name: Nombre del playbook para obtener thresholds
            
        Returns:
            'green', 'yellow', 'red' o 'undefined'
        """
        if margin_pct is None:
            return "undefined"
        
        # Obtener thresholds del playbook correspondiente
        playbook = get_playbook(playbook_name)
        
        if margin_pct >= playbook["green"]:
            return "green"
        if margin_pct >= playbook["yellow"]:
            return "yellow"
        return "red"

    @staticmethod
    def evaluate_net_health(
        net_margin_pct: Optional[float],
        playbook_name: str = "General"
    ) -> str:
        """
        Evalúa la salud neta (después de gastos operativos).
        
        Por ahora mantiene thresholds fijos (pendiente agregar a playbooks):
        - Verde: >= 25%
        - Amarillo: >= 15%
        - Rojo: < 15%
        """
        if net_margin_pct is None:
            return "undefined"
        if net_margin_pct >= 0.25:
            return "green"
        if net_margin_pct >= 0.15:
            return "yellow"
        return "red"

    @staticmethod
    def calculate_batch(
        items: list[Dict[str, Any]], 
        playbook_name: str = "General"
    ) -> list[Dict[str, Any]]:
        """
        Calcula nodos para un batch de items.
        Optimización: procesa múltiples items en una sola llamada.
        
        Args:
            items: Lista de items a procesar
            playbook_name: Playbook a usar para todos los items
            
        Returns:
            Lista de nodos calculados
        """
        return [
            ProfitabilityCalculator.calculate_item_node(item, playbook_name)
            for item in items
        ]
