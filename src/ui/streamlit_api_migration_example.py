"""
Ejemplo de Migración Progresiva con Feature Flags
Muestra cómo migrar Streamlit a API-First sin romper funcionalidad existente.
"""

import streamlit as st
import requests
from typing import List, Dict, Any
import pandas as pd
import sys
import os

# Agregar directorio raíz al path para importar aup_engine
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

# Importar lógica legacy (mantener durante migración)
try:
    from aup_engine import calculate_item_node as legacy_calculate_item_node
    LEGACY_AVAILABLE = True
except ImportError as e:
    print(f"Warning: No se pudo importar aup_engine: {e}")
    LEGACY_AVAILABLE = False
    legacy_calculate_item_node = None

# Configuración
API_URL = "http://localhost:8000"
USE_API_KEY = "use_api_for_calculations"


# =========================
# Feature Flag: Activar/Desactivar API
# =========================

def init_feature_flags():
    """Inicializa feature flags en session_state."""
    if USE_API_KEY not in st.session_state:
        st.session_state[USE_API_KEY] = False  # Desactivado por defecto


def render_feature_flag_toggle():
    """
    Renderiza toggle para activar/desactivar API.
    Incluye advertencia si API no está disponible.
    """
    st.sidebar.markdown("---")
    st.sidebar.subheader("⚙️ Modo de Cálculo")
    
    # Verificar disponibilidad de API
    api_available = check_api_health()
    
    if not api_available:
        st.sidebar.warning("⚠️ API no disponible - usando modo legacy")
        st.session_state[USE_API_KEY] = False
        return
    
    # Toggle
    use_api = st.sidebar.toggle(
        "Usar API para cálculos",
        value=st.session_state.get(USE_API_KEY, False),
        help="Activa para usar backend FastAPI. Desactiva para modo legacy."
    )
    
    st.session_state[USE_API_KEY] = use_api
    
    # Indicador de modo actual
    if use_api:
        st.sidebar.success("✅ Modo API activo")
    else:
        st.sidebar.info("📊 Modo legacy activo")


def check_api_health() -> bool:
    """Verifica si la API está disponible."""
    try:
        response = requests.get(f"{API_URL}/", timeout=2)
        return response.status_code == 200
    except:
        return False


# =========================
# Wrapper: Cálculo con Fallback Automático
# =========================

def calculate_items_with_fallback(
    items: List[Dict[str, Any]],
    playbook_name: str = "General"
) -> List[Dict[str, Any]]:
    """
    Calcula items usando API si está activa, sino fallback a legacy.
    
    Args:
        items: Lista de items a calcular
        playbook_name: Nombre del playbook
        
    Returns:
        Lista de nodos calculados
    """
    use_api = st.session_state.get(USE_API_KEY, False)
    
    if use_api:
        try:
            return calculate_via_api(items, playbook_name)
        except Exception as e:
            st.warning(f"⚠️ API falló, usando modo legacy: {str(e)}")
            return calculate_via_legacy(items)
    else:
        return calculate_via_legacy(items)


def calculate_via_api(
    items: List[Dict[str, Any]],
    playbook_name: str = "General"
) -> List[Dict[str, Any]]:
    """
    Calcula items usando API backend (batch endpoint).
    
    Optimización: Una sola HTTP call para N items.
    """
    try:
        # Preparar request
        payload = {
            "items": items,
            "playbook_name": playbook_name
        }
        
        # Llamar a API
        response = requests.post(
            f"{API_URL}/calculate/batch",
            json=payload,
            timeout=10
        )
        
        response.raise_for_status()
        
        # Extraer nodos
        result = response.json()
        return result["nodes"]
        
    except requests.exceptions.Timeout:
        raise Exception("Timeout al conectar con API")
    except requests.exceptions.ConnectionError:
        raise Exception("No se pudo conectar con API")
    except Exception as e:
        raise Exception(f"Error en API: {str(e)}")


def calculate_via_legacy(
    items: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Calcula items usando función legacy de aup_engine.py.
    
    Nota: No recibe playbook_name porque legacy usa thresholds hardcoded.
    """
    if not LEGACY_AVAILABLE:
        raise Exception("Código legacy no disponible")
    
    return [legacy_calculate_item_node(item) for item in items]


# =========================
# Ejemplo: Formulario de Cotización
# =========================

def render_quote_form():
    """Ejemplo de formulario que usa el wrapper con fallback."""
    st.title("💰 Cotización de Productos")
    
    # Selector de playbook (solo afecta si API está activa)
    playbook_name = st.selectbox(
        "Playbook",
        ["General", "MSP", "SaaS", "Construcción", "Gobierno", "Penetración"],
        help="Solo aplica en modo API. Legacy usa thresholds fijos."
    )
    
    # Editor de ítems
    st.subheader("Items de Cotización")
    
    # Inicializar items en session_state
    if "quote_items" not in st.session_state:
        st.session_state.quote_items = [
            {"item_number": 1, "quantity": 10, "cost_unit": 100, "price_unit": 150},
            {"item_number": 2, "quantity": 5, "cost_unit": 200, "price_unit": 280},
        ]
    
    # Convertir a DataFrame para edición
    df = pd.DataFrame(st.session_state.quote_items)
    
    # Editor interactivo
    edited_df = st.data_editor(
        df,
        num_rows="dynamic",
        use_container_width=True,
        column_config={
            "item_number": st.column_config.NumberColumn("# Línea", disabled=True),
            "quantity": st.column_config.NumberColumn("Cantidad", min_value=0.01),
            "cost_unit": st.column_config.NumberColumn("Costo Unit.", format="$%.2f"),
            "price_unit": st.column_config.NumberColumn("Precio Unit.", format="$%.2f"),
        }
    )
    
    # Botón de cálculo
    if st.button("🧮 Calcular Rentabilidad", type="primary"):
        with st.spinner("Calculando..."):
            # Convertir DataFrame a lista de dicts
            items = edited_df.to_dict('records')
            
            # Calcular con wrapper (usa API o legacy según flag)
            calculated_nodes = calculate_items_with_fallback(items, playbook_name)
            
            # Mostrar resultados
            st.subheader("📊 Resultados")
            
            results_df = pd.DataFrame(calculated_nodes)
            
            # Formatear columnas
            st.dataframe(
                results_df,
                use_container_width=True,
                column_config={
                    "margin_pct": st.column_config.NumberColumn("Margen %", format="%.2f%%"),
                    "gross_profit": st.column_config.NumberColumn("Utilidad", format="$%.2f"),
                    "health": st.column_config.TextColumn("Salud"),
                }
            )
            
            # Resumen
            total_cost = results_df["subtotal_cost"].sum()
            total_revenue = results_df["subtotal_price"].sum()
            total_profit = results_df["gross_profit"].sum()
            
            col1, col2, col3 = st.columns(3)
            col1.metric("Costo Total", f"${total_cost:,.2f}")
            col2.metric("Ingreso Total", f"${total_revenue:,.2f}")
            col3.metric("Utilidad Total", f"${total_profit:,.2f}")


# =========================
# Main App
# =========================

def main():
    st.set_page_config(page_title="DynamiQuote - API Migration", layout="wide")
    
    # Inicializar feature flags
    init_feature_flags()
    
    # Renderizar toggle en sidebar
    render_feature_flag_toggle()
    
    # Renderizar formulario
    render_quote_form()
    
    # Footer
    st.sidebar.markdown("---")
    st.sidebar.caption(f"Modo: {'API' if st.session_state.get(USE_API_KEY) else 'Legacy'}")


if __name__ == "__main__":
    main()
