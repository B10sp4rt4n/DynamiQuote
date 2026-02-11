"""
Quote State Management

Gestor centralizado de estado para cotizaciones.
Reemplaza el uso disperso de st.session_state con una clase estructurada.
"""

from typing import Dict, List, Any, Optional
from datetime import datetime, UTC
import uuid

from .calculations import (
    calculate_line_subtotals,
    calculate_quote_totals,
    calculate_margin,
    calculate_price_from_margin
)
from .validators import (
    ValidationError,
    validate_line,
    check_duplicate_sku
)


class QuoteState:
    """
    Gestor centralizado de estado para una cotización.
    
    Esta clase encapsula toda la lógica de estado que antes estaba dispersa
    en múltiples keys de st.session_state.
    
    Attributes:
        quote_id: ID único de la cotización
        quote_group_id: ID del grupo (para versiones)
        version: Número de versión
        parent_quote_id: ID de la cotización padre (si es derivada)
        lines: Lista de líneas de cotización
        pending_line: Línea pendiente de confirmación
        metadata: Información adicional (cliente, nombre, cotizador)
    """
    
    def __init__(
        self,
        quote_id: Optional[str] = None,
        quote_group_id: Optional[str] = None,
        version: int = 1,
        parent_quote_id: Optional[str] = None
    ):
        """
        Inicializar estado de cotización.
        
        Args:
            quote_id: ID de la cotización (se genera si no se provee)
            quote_group_id: ID del grupo (se genera si no se provee)
            version: Número de versión (default: 1)
            parent_quote_id: ID de cotización padre (optional)
        """
        self.quote_id = quote_id or str(uuid.uuid4())
        self.quote_group_id = quote_group_id or str(uuid.uuid4())
        self.version = version
        self.parent_quote_id = parent_quote_id
        
        self.lines: List[Dict[str, Any]] = []
        self.pending_line: Optional[Dict[str, Any]] = None
        
        self.metadata = {
            "proposal_name": "",
            "client_name": "",
            "quoted_by": "",
            "playbook": "General",
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat()
        }
    
    # =========================
    # Gestión de líneas
    # =========================
    
    def add_line(self, line: Dict[str, Any], validate: bool = True) -> Dict[str, Any]:
        """
        Agregar una línea a la cotización.
        
        Args:
            line: Datos de la línea
            validate: Si se debe validar la línea (default: True)
            
        Returns:
            Línea agregada con IDs y timestamps
            
        Raises:
            ValidationError: Si la línea no pasa validación
        """
        # Validar línea
        if validate:
            line = validate_line(line, sku_required=True)
        
        # Verificar SKU duplicado
        if line.get("sku") and check_duplicate_sku(line["sku"], self.lines):
            raise ValidationError(f"SKU '{line['sku']}' ya existe en esta cotización")
        
        # Agregar metadata
        if "line_id" not in line:
            line["line_id"] = str(uuid.uuid4())
        
        if "created_at" not in line:
            line["created_at"] = datetime.now(UTC).isoformat()
        
        # Calcular precio si solo hay margen
        if line.get("margin_target") and not line.get("final_price_unit"):
            line["final_price_unit"] = calculate_price_from_margin(
                line["cost_unit"],
                line["margin_target"]
            )
        
        # Calcular subtotales
        subtotals = calculate_line_subtotals(line)
        line.update(subtotals)
        
        # Agregar línea
        self.lines.append(line)
        
        # Actualizar timestamp
        self.metadata["updated_at"] = datetime.now(UTC).isoformat()
        
        return line
    
    def update_line(self, index: int, updates: Dict[str, Any]) -> Dict[str, Any]:
        """
        Actualizar una línea existente.
        
        Args:
            index: Índice de la línea (0-based)
            updates: Campos a actualizar
            
        Returns:
            Línea actualizada
            
        Raises:
            IndexError: Si el índice es inválido
            ValidationError: Si los updates son inválidos
        """
        if not (0 <= index < len(self.lines)):
            raise IndexError(f"Índice {index} fuera de rango")
        
        line = self.lines[index]
        
        # Aplicar actualizaciones
        line.update(updates)
        
        # Recalcular si cambiaron cantidad, costo o precio
        if any(key in updates for key in ["quantity", "cost_unit", "final_price_unit"]):
            subtotals = calculate_line_subtotals(line)
            line.update(subtotals)
        
        self.metadata["updated_at"] = datetime.now(UTC).isoformat()
        
        return line
    
    def remove_line(self, index: int) -> Dict[str, Any]:
        """
        Eliminar una línea por índice.
        
        Args:
            index: Índice de la línea (0-based)
            
        Returns:
            Línea eliminada
            
        Raises:
            IndexError: Si el índice es inválido
        """
        if not (0 <= index < len(self.lines)):
            raise IndexError(f"Índice {index} fuera de rango")
        
        removed = self.lines.pop(index)
        self.metadata["updated_at"] = datetime.now(UTC).isoformat()
        
        return removed
    
    def remove_lines(self, indices: List[int]) -> List[Dict[str, Any]]:
        """
        Eliminar múltiples líneas por índices.
        
        Args:
            indices: Lista de índices a eliminar
            
        Returns:
            Lista de líneas eliminadas
        """
        # Ordenar en reversa para evitar problemas de índice
        removed = []
        for idx in sorted(indices, reverse=True):
            try:
                removed.append(self.remove_line(idx))
            except IndexError:
                pass  # Ignorar índices inválidos
        
        return list(reversed(removed))
    
    def clear_lines(self) -> int:
        """
        Limpiar todas las líneas.
        
        Returns:
            Número de líneas eliminadas
        """
        count = len(self.lines)
        self.lines = []
        self.metadata["updated_at"] = datetime.now(UTC).isoformat()
        return count
    
    def get_line(self, index: int) -> Dict[str, Any]:
        """
        Obtener una línea por índice.
        
        Args:
            index: Índice de la línea
            
        Returns:
            Línea en el índice especificado
        """
        return self.lines[index]
    
    def find_line_by_sku(self, sku: str) -> Optional[Dict[str, Any]]:
        """
        Buscar una línea por SKU.
        
        Args:
            sku: SKU a buscar
            
        Returns:
            Primera línea con ese SKU o None
        """
        for line in self.lines:
            if line.get("sku", "").lower() == sku.lower():
                return line
        return None
    
    # =========================
    # Cálculos consolidados
    # =========================
    
    def calculate_totals(self) -> Dict[str, float]:
        """
        Calcular totales consolidados de la cotización.
        
        Returns:
            Diccionario con totales (total_cost, total_revenue, gross_profit, avg_margin_pct)
        """
        return calculate_quote_totals(self.lines)
    
    def get_health_status(self, playbook: Optional[Dict] = None) -> str:
        """
        Obtener estado de salud de la cotización.
        
        Args:
            playbook: Diccionario de playbook con umbrales (opcional)
            
        Returns:
            "green", "yellow", o "red"
        """
        totals = self.calculate_totals()
        margin = totals["avg_margin_pct"]
        
        if playbook:
            green = playbook.get("green", 35) * 100
            yellow = playbook.get("yellow", 25) * 100
        else:
            green = 35
            yellow = 25
        
        if margin >= green:
            return "green"
        elif margin >= yellow:
            return "yellow"
        else:
            return "red"
    
    # =========================
    # Metadata
    # =========================
    
    def set_metadata(self, key: str, value: Any) -> None:
        """
        Establecer valor de metadata.
        
        Args:
            key: Clave del metadata
            value: Valor a establecer
        """
        self.metadata[key] = value
        self.metadata["updated_at"] = datetime.now(UTC).isoformat()
    
    def update_metadata(self, data: Dict[str, Any]) -> None:
        """
        Actualizar múltiples valores de metadata.
        
        Args:
            data: Diccionario con valores a actualizar
        """
        self.metadata.update(data)
        self.metadata["updated_at"] = datetime.now(UTC).isoformat()
    
    # =========================
    # Versionado
    # =========================
    
    def derive_new_version(self) -> "QuoteState":
        """
        Crear una nueva versión derivada de esta cotización.
        
        Returns:
            Nueva instancia de QuoteState con versión incrementada
        """
        new_state = QuoteState(
            quote_id=str(uuid.uuid4()),
            quote_group_id=self.quote_group_id,  # Mismo grupo
            version=self.version + 1,
            parent_quote_id=self.quote_id
        )
        
        # Copiar líneas (con nuevos IDs)
        for line in self.lines:
            new_line = line.copy()
            new_line["line_id"] = str(uuid.uuid4())
            new_line["created_at"] = datetime.now(UTC).isoformat()
            new_state.lines.append(new_line)
        
        # Copiar metadata
        new_state.metadata = self.metadata.copy()
        new_state.metadata["created_at"] = datetime.now(UTC).isoformat()
        new_state.metadata["updated_at"] = datetime.now(UTC).isoformat()
        
        return new_state
    
    # =========================
    # Serialización
    # =========================
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convertir estado a diccionario serializable.
        
        Returns:
            Diccionario con todo el estado
        """
        totals = self.calculate_totals()
        
        return {
            "quote_id": self.quote_id,
            "quote_group_id": self.quote_group_id,
            "version": self.version,
            "parent_quote_id": self.parent_quote_id,
            "lines": self.lines.copy(),
            "pending_line": self.pending_line,
            "metadata": self.metadata.copy(),
            "totals": totals
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "QuoteState":
        """
        Crear instancia desde diccionario.
        
        Args:
            data: Diccionario con datos del estado
            
        Returns:
            Nueva instancia de QuoteState
        """
        state = cls(
            quote_id=data.get("quote_id"),
            quote_group_id=data.get("quote_group_id"),
            version=data.get("version", 1),
            parent_quote_id=data.get("parent_quote_id")
        )
        
        state.lines = data.get("lines", []).copy()
        state.pending_line = data.get("pending_line")
        state.metadata = data.get("metadata", {}).copy()
        
        return state
    
    # =========================
    # Representación
    # =========================
    
    def __repr__(self) -> str:
        totals = self.calculate_totals()
        return (
            f"QuoteState(id={self.quote_id[:8]}..., "
            f"v{self.version}, "
            f"{totals['line_count']} líneas, "
            f"${totals['total_revenue']:,.2f})"
        )
    
    def __len__(self) -> int:
        """Número de líneas en la cotización."""
        return len(self.lines)
