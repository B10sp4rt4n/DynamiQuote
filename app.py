# DynamiQuote - Build: 2026-02-10-05:30 - PDF Generation with ReportLab
import streamlit as st
import pandas as pd
import uuid
from datetime import datetime, UTC
import matplotlib.pyplot as plt
from spellchecker import SpellChecker
from database import init_database, save_quote, save_import_file, get_all_quotes, get_quote_lines, get_quote_lines_full, get_latest_version, load_versions_for_group, load_lines_for_quote, get_database_info, get_cursor, is_postgres, get_connection, save_logo, get_logos, search_quotes, get_recent_quotes, get_quote_groups_summary, get_quote_by_group_id, clear_search_caches, authenticate_user, create_user, get_all_users, toggle_user_active, update_user_password, users_exist
from excel_import import import_excel_file, format_validation_report
from formal_proposal_generator import process_logo_upload
import os
from aup_engine import (
    create_proposal,
    import_excel,
    add_proposal_item,
    update_proposal_item,
    calculate_item_node,
    get_items_with_nodes,
    recalculate_integrated_node,
    close_proposal,
    derive_proposal,
    add_project_expense,
    recalculate_profitability_node,
    compare_proposals,
    generate_charts_data,
)

# =========================
# Configuración de Performance
# =========================
# Configurar matplotlib para no usar modo interactivo
plt.ioff()

# Inicializar SpellChecker una sola vez
@st.cache_resource
def get_spell_checker():
    """Cache del corrector ortográfico para evitar recargas."""
    return SpellChecker(language='es')

# =========================
# Helpers de Performance
# =========================

def cleanup_session_state():
    """
    Limpia datos innecesarios del session_state para liberar memoria.
    Solo mantiene los datos esenciales para la operación actual.
    """
    # Lista de claves que DEBEN mantenerse
    essential_keys = {
        'quote_id', 'quote_group_id', 'version', 'parent_quote_id', 'lines',
        'pending_line', 'input_proposal_name', 'input_client_name', 'input_quoted_by',
        'saved_proposal_name', 'saved_client_name', 'saved_quoted_by',
        'openai_enabled', 'openai_api_key'
    }
    
    # Limpiar claves que no sean esenciales
    keys_to_remove = [k for k in st.session_state.keys() if k not in essential_keys]
    
    for key in keys_to_remove:
        # Solo eliminar si no es usado recientemente
        if key.startswith('compare_') or key.startswith('version_select_') or key.startswith('page_'):
            try:
                del st.session_state[key]
            except:
                pass


# =========================
# UI Helpers para Búsqueda de Cotizaciones
# =========================

def render_advanced_quote_search(key: str, title: str = "🔍 Buscador de Cotizaciones"):
    """
    Renderiza un buscador avanzado de cotizaciones con filtros y búsqueda en tiempo real.
    
    Args:
        key: Key única para el widget
        title: Título del buscador
        
    Returns:
        quote_group_id seleccionado o None
    """
    st.subheader(title)
    
    # Buscador principal
    col_search, col_filters = st.columns([3, 1])
    
    with col_search:
        search_query = st.text_input(
            "Buscar por cliente, propuesta, cotizado por...",
            key=f"{key}_advanced_search",
            placeholder="Ej: Acme Corp, Proyecto Alpha, Juan Pérez...",
            help="Busca en: Cliente, Propuesta, Cotizado por. La búsqueda es inteligente y encuentra coincidencias parciales."
        )
    
    with col_filters:
        show_filters = st.checkbox("Filtros avanzados", key=f"{key}_show_filters", value=False)
    
    # Filtros avanzados (colapsables)
    date_from = None
    date_to = None
    min_amount = None
    max_amount = None
    selected_status = None
    
    if show_filters:
        with st.expander("🔧 Filtros Avanzados", expanded=True):
            col1, col2 = st.columns(2)
            
            with col1:
                st.caption("**Rango de Fechas**")
                date_from = st.date_input("Desde", key=f"{key}_date_from", value=None)
                date_to = st.date_input("Hasta", key=f"{key}_date_to", value=None)
            
            with col2:
                st.caption("**Rango de Montos**")
                min_amount = st.number_input("Monto mínimo", key=f"{key}_min_amount", min_value=0.0, value=0.0, step=1000.0)
                max_amount = st.number_input("Monto máximo", key=f"{key}_max_amount", min_value=0.0, value=0.0, step=1000.0)
                if max_amount == 0.0:
                    max_amount = None
            
            selected_status = st.multiselect(
                "Estados",
                options=["draft", "sent", "approved", "rejected", "closed"],
                key=f"{key}_status_filter"
            )
    
    # Realizar búsqueda
    if search_query and search_query.strip():
        results = search_quotes(search_query, limit=50)
    else:
        st.caption("💡 Mostrando cotizaciones recientes")
        results = get_recent_quotes(limit=30)
    
    if not results:
        st.info("💭 No se encontraron resultados. Intenta con otros términos de búsqueda.")
        return None
    
    # Convertir a DataFrame
    results_df = pd.DataFrame(
        results,
        columns=["quote_id", "quote_group_id", "version", "parent_quote_id", 
                "created_at", "status", "total_cost", "total_revenue", 
                "gross_profit", "avg_margin", "playbook_name", "client_name", 
                "quoted_by", "proposal_name"]
    )
    
    # Aplicar filtros
    if date_from:
        results_df = results_df[pd.to_datetime(results_df["created_at"]).dt.date >= date_from]
    if date_to:
        results_df = results_df[pd.to_datetime(results_df["created_at"]).dt.date <= date_to]
    if min_amount and min_amount > 0:
        results_df = results_df[results_df["total_revenue"] >= min_amount]
    if max_amount:
        results_df = results_df[results_df["total_revenue"] <= max_amount]
    if selected_status:
        results_df = results_df[results_df["status"].isin(selected_status)]
    
    if results_df.empty:
        st.warning("⚠️ Los filtros eliminaron todos los resultados. Ajusta los criterios.")
        return None
    
    # Mostrar contador de resultados
    st.caption(f"📊 **{len(results_df)} resultados encontrados**")
    
    # Vista de resultados con tarjetas
    selected_group_id = None
    
    for idx, row in results_df.iterrows():
        with st.container():
            col1, col2, col3, col4, col5 = st.columns([2, 2, 1, 1, 1])
            
            with col1:
                client = row["client_name"] if row["client_name"] else "Sin cliente"
                proposal = row["proposal_name"] if row["proposal_name"] else "Sin nombre"
                st.markdown(f"**{client}**")
                st.caption(f"📋 {proposal}")
            
            with col2:
                quoted_by = row["quoted_by"] if row["quoted_by"] else "N/A"
                date = pd.to_datetime(row["created_at"]).strftime("%Y-%m-%d")
                st.caption(f"👤 {quoted_by}")
                st.caption(f"📅 {date}")
            
            with col3:
                revenue = row["total_revenue"]
                st.metric("Total", f"${revenue:,.0f}", label_visibility="collapsed")
            
            with col4:
                margin = row["avg_margin"]
                delta_color = "normal" if margin >= 25 else "inverse"
                st.metric("Margen", f"{margin:.1f}%", label_visibility="collapsed", delta_color=delta_color)
            
            with col5:
                if st.button("Seleccionar", key=f"{key}_select_{row['quote_group_id']}", type="primary", width='stretch'):
                    selected_group_id = row["quote_group_id"]
                    st.session_state[f"{key}_selected_group"] = selected_group_id
                    st.rerun()
            
            st.divider()
    
    # Retornar selección guardada
    if f"{key}_selected_group" in st.session_state:
        return st.session_state[f"{key}_selected_group"]
    
    return selected_group_id


def render_quote_search_selector(key: str, label: str = "Buscar cotización", show_recent: bool = True):
    """
    Renderiza un selector de cotizaciones con búsqueda optimizada.
    
    Args:
        key: Key única para el widget
        label: Etiqueta del campo de búsqueda
        show_recent: Si es True, muestra las cotizaciones recientes si no hay búsqueda
        
    Returns:
        quote_group_id seleccionado o None
    """
    col_search, col_btn = st.columns([4, 1])
    
    with col_search:
        search_query = st.text_input(
            label,
            key=f"{key}_search",
            placeholder="Escribe nombre de cliente o propuesta...",
            help="Busca por nombre de cliente o propuesta"
        )
    
    with col_btn:
        st.write("")  # Spacer
        search_clicked = st.button("🔍 Buscar", key=f"{key}_btn")
    
    # Realizar búsqueda
    if search_query and search_query.strip():
        results = search_quotes(search_query, limit=20)
    elif show_recent:
        st.caption("💡 Mostrando cotizaciones recientes")
        results = get_recent_quotes(limit=20)
    else:
        return None
    
    if not results:
        st.warning("No se encontraron cotizaciones")
        return None
    
    # Convertir a DataFrame para mejor visualización
    results_df = pd.DataFrame(
        results,
        columns=["quote_id", "quote_group_id", "version", "parent_quote_id", 
                "created_at", "status", "total_cost", "total_revenue", 
                "gross_profit", "avg_margin", "playbook_name", "client_name", 
                "quoted_by", "proposal_name"]
    )
    
    # Crear opciones de selección descriptivas
    options = {}
    for _, row in results_df.iterrows():
        client = row["client_name"] if row["client_name"] else "Sin nombre"
        proposal = row["proposal_name"] if row["proposal_name"] else "Sin nombre"
        revenue = row["total_revenue"]
        margin = row["avg_margin"]
        date = pd.to_datetime(row["created_at"]).strftime("%Y-%m-%d")
        
        display_text = f"{client} - {proposal} | ${revenue:,.0f} | {margin:.1f}% | {date}"
        options[display_text] = row["quote_group_id"]
    
    if not options:
        return None
    
    selected = st.selectbox(
        f"Selecciona una cotización ({len(options)} resultados)",
        options=list(options.keys()),
        key=f"{key}_selector"
    )
    
    if selected:
        return options[selected]
    
    return None


def render_quote_card(quote_data: dict):
    """
    Renderiza una tarjeta con información de una cotización.
    
    Args:
        quote_data: Diccionario con datos de la cotización
    """
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.metric("Cliente", quote_data.get("client_name", "Sin nombre"))
    
    with col2:
        revenue = quote_data.get("total_revenue", 0)
        st.metric("Total", f"${revenue:,.2f}")
    
    with col3:
        margin = quote_data.get("avg_margin", 0)
        st.metric("Margen", f"{margin:.1f}%")
    
    with col4:
        version = quote_data.get("version", 1)
        st.metric("Versión", f"v{version}")


# =========================
# Playbooks de Evaluación
# =========================
PLAYBOOKS = {
    "General": {
        "description": "Evaluación estándar para cotizaciones generales",
        "green": 0.35,
        "yellow": 0.25,
        "red": 0.25,
        "max_red_green": 0.1,  # Máximo 10% de líneas rojas para estado verde
        "max_red_yellow": 0.3,  # Máximo 30% de líneas rojas para estado amarillo
        "weights": {
            "health": 0.30,   # 30% peso a salud general
            "margin": 0.45,   # 45% peso a margen
            "profit": 0.25    # 25% peso a utilidad
        }
    },
    "MSP": {
        "description": "Managed Service Provider - Servicios recurrentes",
        "green": 0.30,
        "yellow": 0.20,
        "red": 0.20,
        "max_red_green": 0.05,  # MSP debe ser más conservador
        "max_red_yellow": 0.20,
        "weights": {
            "health": 0.40,   # Mayor énfasis en salud para servicios recurrentes
            "margin": 0.40,
            "profit": 0.20
        }
    },
    "SaaS": {
        "description": "Software as a Service - Productos digitales",
        "green": 0.40,
        "yellow": 0.30,
        "red": 0.30,
        "max_red_green": 0.15,  # Mayor tolerancia por escalabilidad
        "max_red_yellow": 0.35,
        "weights": {
            "health": 0.25,
            "margin": 0.50,   # Mayor énfasis en margen para productos digitales
            "profit": 0.25
        }
    },
    "Construcción": {
        "description": "Proyectos de construcción e infraestructura",
        "green": 0.25,
        "yellow": 0.18,
        "red": 0.18,
        "max_red_green": 0.08,
        "max_red_yellow": 0.25,
        "weights": {
            "health": 0.35,
            "margin": 0.30,
            "profit": 0.35    # Mayor énfasis en profit total para proyectos grandes
        }
    },
    "Gobierno": {
        "description": "Licitaciones y contratos gubernamentales",
        "green": 0.20,
        "yellow": 0.15,
        "red": 0.15,
        "max_red_green": 0.05,  # Gobierno requiere mayor precisión
        "max_red_yellow": 0.15,
        "weights": {
            "health": 0.50,   # Mayor énfasis en cumplimiento y salud
            "margin": 0.25,
            "profit": 0.25
        }
    },
    "Penetración": {
        "description": "Estrategia agresiva de entrada al mercado",
        "green": 0.15,
        "yellow": 0.10,
        "red": 0.10,
        "max_red_green": 0.20,  # Mayor tolerancia para estrategias agresivas
        "max_red_yellow": 0.40,
        "weights": {
            "health": 0.20,
            "margin": 0.30,
            "profit": 0.50    # Prioridad a volumen de profit sobre margen
        }
    }
}

# =========================
# Configuración
# =========================
# DynamiQuote - Updated: 2026-02-09
st.set_page_config(page_title="Quote Intelligence MVP", layout="wide")

# =========================
# Sistema de Autenticación
# =========================
init_database()

def _render_login():
    """Pantalla de login centrada."""
    col_l, col_c, col_r = st.columns([1, 1.2, 1])
    with col_c:
        st.image("https://img.icons8.com/fluency/96/lock.png", width=72)
        st.title("DynamiQuote")
        st.caption("Ingresa tus credenciales para continuar")
        st.divider()
        with st.form("login_form"):
            alias = st.text_input("Usuario", placeholder="tu.alias").strip().lower()
            password = st.text_input("Contraseña", type="password")
            submitted = st.form_submit_button("Iniciar sesión", type="primary", use_container_width=True)
        if submitted:
            if not alias or not password:
                st.error("Ingresa usuario y contraseña")
            else:
                user = authenticate_user(alias, password)
                if user:
                    # Limpiar todo el estado previo del formulario antes de entrar
                    _keep = {'openai_enabled', 'openai_api_key'}
                    for _k in list(st.session_state.keys()):
                        if _k not in _keep:
                            del st.session_state[_k]
                    st.session_state['authenticated'] = True
                    st.session_state['current_user'] = user
                    st.session_state['saved_quoted_by'] = user['full_name']
                    st.rerun()
                else:
                    st.error("Credenciales incorrectas o usuario inactivo")

        # Primer uso: si no hay usuarios, mostrar setup inicial
        if not users_exist():
            st.info("⚙️ Primera vez — Configura el usuario administrador")
            with st.expander("Crear administrador inicial", expanded=True):
                with st.form("setup_admin"):
                    s_alias = st.text_input("Alias (usuario)", placeholder="admin")
                    s_first = st.text_input("Nombre")
                    s_last = st.text_input("Apellido")
                    s_pass = st.text_input("Contraseña", type="password")
                    s_pass2 = st.text_input("Confirmar contraseña", type="password")
                    if st.form_submit_button("Crear administrador", type="primary", use_container_width=True):
                        if not all([s_alias, s_first, s_last, s_pass]):
                            st.error("Completa todos los campos")
                        elif s_pass != s_pass2:
                            st.error("Las contraseñas no coinciden")
                        else:
                            ok, msg = create_user(s_alias, s_first, s_last, s_pass, role='admin')
                            if ok:
                                st.success(f"✅ {msg} — Ya puedes iniciar sesión")
                                st.rerun()
                            else:
                                st.error(msg)

if not st.session_state.get('authenticated', False):
    _render_login()
    st.stop()

# Usuario autenticado
_current_user = st.session_state['current_user']
_is_admin = _current_user['role'] == 'admin'

# =========================
# Sidebar - Configuración de OpenAI
# =========================
with st.sidebar:
    # Usuario logueado
    st.markdown(f"👤 **{_current_user['full_name']}**")
    st.caption(f"@{_current_user['alias']} · {'👑 Admin' if _is_admin else '🧑 Usuario'}")
    if st.button("🚪 Cerrar sesión", use_container_width=True):
        _logout_keep = {'openai_enabled', 'openai_api_key'}
        for _k in list(st.session_state.keys()):
            if _k not in _logout_keep:
                st.session_state.pop(_k, None)
        st.rerun()
    st.divider()

    st.header("⚙️ Configuración")

    # OpenAI API Key — se carga automáticamente desde secrets o variable de entorno
    st.subheader("🤖 Corrección Inteligente con IA")

    # Prioridad: st.secrets > variable de entorno
    _auto_key = ""
    try:
        _auto_key = st.secrets.get("OPENAI_API_KEY", "") or ""
    except Exception:
        pass
    if not _auto_key:
        _auto_key = os.getenv("OPENAI_API_KEY", "") or ""

    if _auto_key and _auto_key.startswith("sk-"):
        st.session_state.openai_enabled = True
        st.session_state.openai_api_key = _auto_key
        st.success("✅ IA habilitada — Sugerencias y correcciones con GPT disponibles")
    else:
        st.session_state.openai_enabled = False
        st.session_state.openai_api_key = None
        st.warning("⚠️ IA no disponible — Configura OPENAI_API_KEY en Secrets")

    st.divider()

    # Info de base de datos
    db_info = get_database_info()
    st.caption(f"💾 Base de datos: {db_info['type']}")
    if db_info['type'] == 'PostgreSQL':
        st.caption(f"🌐 Host: {db_info['host']}")

st.title("🧾 DynamiQuote – Motor Multitenant de Propuestas")

# =========================
# Búsqueda Global (Siempre Visible)
# =========================
with st.expander("🔍 **Búsqueda Rápida de Cotizaciones y Propuestas**", expanded=False):
    st.caption("Encuentra rápidamente cualquier cotización o propuesta escribiendo su nombre, cliente, o quien la cotizó.")
    
    col_quick_search, col_quick_btn = st.columns([4, 1])
    
    with col_quick_search:
        quick_search = st.text_input(
            "Buscar",
            key="global_quick_search",
            placeholder="Ej: Acme Corp, Proyecto Alpha, Juan Pérez, 50000...",
            label_visibility="collapsed"
        )
    
    with col_quick_btn:
        quick_search_btn = st.button("🔍 Buscar", key="global_search_btn", width='stretch')
    
    if quick_search and quick_search.strip():
        with st.spinner("Buscando..."):
            quick_results = search_quotes(quick_search, limit=10)
            
            if quick_results:
                st.success(f"✅ {len(quick_results)} resultados encontrados")
                
                # Mostrar resultados en tarjetas compactas
                for result in quick_results:
                    quote_id, group_id, version, parent_id, created_at, status, total_cost, total_revenue, gross_profit, avg_margin, playbook, client, quoted_by, proposal = result
                    
                    with st.container():
                        col1, col2, col3, col4 = st.columns([3, 2, 1, 1])
                        
                        with col1:
                            st.markdown(f"**{client or 'Sin cliente'}** - {proposal or 'Sin nombre'}")
                            st.caption(f"👤 {quoted_by or 'N/A'} | 📅 {pd.to_datetime(created_at).strftime('%Y-%m-%d')}")
                        
                        with col2:
                            st.caption(f"💰 ${total_revenue:,.0f}")
                            st.caption(f"📊 Margen: {avg_margin:.1f}%")
                        
                        with col3:
                            st.caption(f"v{version}")
                            st.caption(f"🏷️ {status}")
                        
                        with col4:
                            # Botones de acción rápida
                            if st.button("Ver", key=f"global_view_{group_id}", width='stretch', type="secondary"):
                                st.session_state['selected_quote_group'] = group_id
                                st.info(f"💡 Cotización {client or 'Sin cliente'} seleccionada. Ve al tab correspondiente para verla.")
                        
                        st.divider()
            else:
                st.warning("⚠️ No se encontraron resultados. Intenta con otros términos.")

st.divider()

# =========================
# Tabs principales
# =========================
tab_quotes, tab_comparator, tab_db = st.tabs([
    "💼 Cotizaciones y Propuestas", 
    "⚖️ Comparador", 
    "📚 Base de Datos"
])

# =========================
# Spellchecker Básico
# =========================

def suggest_description_fix_basic(text):
    """Corrector ortográfico básico usando PySpellChecker cacheado."""
    spell = get_spell_checker()  # Usar versión cacheada
    words = text.split()
    corrected_words = []
    suggestions = []

    for w in words:
        if w.lower() in spell:
            corrected_words.append(w)
        else:
            correction = spell.correction(w)
            corrected_words.append(correction if correction else w)
            if correction and correction != w:
                suggestions.append(f"{w} → {correction}")

    return " ".join(corrected_words), suggestions

def suggest_description_fix_ai(text, api_key):
    """Corrector inteligente usando OpenAI GPT."""
    try:
        from openai import OpenAI

        # Validar API key
        if not api_key or not api_key.strip():
            st.session_state.ai_error = "⚠️ API Key vacía. Usando corrector básico."
            return suggest_description_fix_basic(text)

        client = OpenAI(api_key=api_key)

        # Mostrar indicador de carga
        with st.spinner("🤖 OpenAI analizando texto..."):
            response = client.chat.completions.create(
                model="gpt-4o-mini",  # Modelo más económico
                messages=[
                    {
                        "role": "system",
                        "content": """Eres un asistente experto en corrección de textos comerciales en español.
Tu tarea es:
1. Corregir ortografía y gramática
2. Expandir abreviaturas comunes (SW → software, soport → soporte)
3. Profesionalizar el texto manteniendo el significado
4. Mantener términos técnicos y números exactos
5. Responder SOLO con el texto corregido, sin explicaciones adicionales"""
                    },
                    {
                        "role": "user",
                        "content": f"Corrige y mejora este texto: {text}"
                    }
                ],
                temperature=0.3,
                max_tokens=200,
                timeout=10.0  # Timeout de 10 segundos
            )

        corrected = response.choices[0].message.content.strip()

        # Generar lista de cambios comparando palabra por palabra
        suggestions = []
        if corrected.lower() != text.lower():
            # Mostrar cambios específicos
            original_words = text.split()
            corrected_words = corrected.split()

            # Si cambió significativamente, mostrar antes/después
            if len(original_words) != len(corrected_words) or corrected != text:
                suggestions.append(f"📝 {text} → ✨ {corrected}")

        # Limpiar error previo si todo salió bien
        if 'ai_error' in st.session_state:
            del st.session_state.ai_error

        return corrected, suggestions

    except ImportError:
        error_msg = "⚠️ Librería OpenAI no instalada. Usando corrector básico."
        st.session_state.ai_error = error_msg
        return suggest_description_fix_basic(text)
    except Exception as e:
        error_msg = str(e)
        if "api_key" in error_msg.lower() or "authentication" in error_msg.lower() or "incorrect" in error_msg.lower():
            st.session_state.ai_error = "❌ API Key de OpenAI inválida. Verifica tu clave en la barra lateral."
        elif "quota" in error_msg.lower():
            st.session_state.ai_error = "❌ Cuota de OpenAI excedida. Verifica tu cuenta en platform.openai.com"
        elif "timeout" in error_msg.lower():
            st.session_state.ai_error = "❌ Timeout conectando a OpenAI. Intenta de nuevo."
        else:
            st.session_state.ai_error = f"❌ Error OpenAI: {error_msg[:100]}"

        return suggest_description_fix_basic(text)

def suggest_description_fix(text):
    """Función principal de corrección - usa OpenAI si está habilitado."""
    if st.session_state.get('openai_enabled', False):
        api_key = st.session_state.get('openai_api_key')
        return suggest_description_fix_ai(text, api_key)
    else:
        return suggest_description_fix_basic(text)

# =========================
# Helpers de lectura AUP
# =========================

def _aup_execute(cur, query_pg, query_sqlite, params):
    if is_postgres():
        cur.execute(query_pg, params)
    else:
        cur.execute(query_sqlite, params)


def _aup_fetchone(query_pg, query_sqlite, params):
    with get_cursor() as cur:
        _aup_execute(cur, query_pg, query_sqlite, params)
        row = cur.fetchone()
        if row is None:
            return None
        cols = [desc[0] for desc in cur.description]
        return dict(zip(cols, row))


def _aup_fetchall(query_pg, query_sqlite, params):
    with get_cursor() as cur:
        _aup_execute(cur, query_pg, query_sqlite, params)
        rows = cur.fetchall()
        if not rows:
            return []
        cols = [desc[0] for desc in cur.description]
        return [dict(zip(cols, row)) for row in rows]


def aup_get_proposal(proposal_id, tenant_id):
    return _aup_fetchone(
        "SELECT * FROM proposals WHERE proposal_id = %s AND tenant_id = %s",
        "SELECT * FROM proposals WHERE proposal_id = ? AND tenant_id = ?",
        (proposal_id, tenant_id),
    )


def aup_get_items(proposal_id, tenant_id):
    return _aup_fetchall(
        """
        SELECT item_id, item_number, quantity, sku, description, cost_unit, price_unit,
               subtotal_cost, subtotal_price, status, origin, component_type
        FROM proposal_items
        WHERE proposal_id = %s AND tenant_id = %s
        ORDER BY item_number
        """,
        """
        SELECT item_id, item_number, quantity, sku, description, cost_unit, price_unit,
               subtotal_cost, subtotal_price, status, origin, component_type
        FROM proposal_items
        WHERE proposal_id = ? AND tenant_id = ?
        ORDER BY item_number
        """,
        (proposal_id, tenant_id),
    )


def aup_get_integrated_node(proposal_id, tenant_id):
    return _aup_fetchone(
        "SELECT * FROM proposal_integrated_node WHERE proposal_id = %s AND tenant_id = %s",
        "SELECT * FROM proposal_integrated_node WHERE proposal_id = ? AND tenant_id = ?",
        (proposal_id, tenant_id),
    )


def aup_get_profitability_node(proposal_id, tenant_id):
    return _aup_fetchone(
        "SELECT * FROM proposal_profitability_node WHERE proposal_id = %s AND tenant_id = %s",
        "SELECT * FROM proposal_profitability_node WHERE proposal_id = ? AND tenant_id = ?",
        (proposal_id, tenant_id),
    )


def aup_get_expenses(proposal_id, tenant_id):
    return _aup_fetchall(
        """
        SELECT expense_id, category, description, amount, created_at
        FROM project_expenses
        WHERE proposal_id = %s AND tenant_id = %s
        ORDER BY created_at DESC
        """,
        """
        SELECT expense_id, category, description, amount, created_at
        FROM project_expenses
        WHERE proposal_id = ? AND tenant_id = ?
        ORDER BY created_at DESC
        """,
        (proposal_id, tenant_id),
    )

# =========================
# Narrativa de Comparación
# =========================
def calculate_health_status(avg_margin, total_revenue, playbook_name="General", df_lines=None):
    """
    Calcula el estado de salud de una cotización usando playbook específico.

    Args:
        avg_margin: Margen promedio de la cotización
        total_revenue: Ingreso total
        playbook_name: Nombre del playbook a usar (default: General)
        df_lines: DataFrame con líneas para calcular red_ratio (opcional)

    Returns:
        str: "verde", "amarillo" o "rojo"
    """
    pb = PLAYBOOKS.get(playbook_name, PLAYBOOKS["General"])

    # Si no hay revenue, es rojo automáticamente
    if total_revenue <= 0:
        return "rojo"

    # Calcular ratio de líneas rojas si tenemos el DataFrame
    red_ratio = 0.0
    if df_lines is not None and len(df_lines) > 0:
        red_ratio = (df_lines["margin_pct"] < pb["yellow"]).sum() / len(df_lines)

    # Evaluación por playbook
    if avg_margin >= pb["green"] and red_ratio <= pb["max_red_green"]:
        return "verde"
    elif avg_margin >= pb["yellow"] and red_ratio <= pb["max_red_yellow"]:
        return "amarillo"
    else:
        return "rojo"

def score_version(q, health, playbook_name="General"):
    """
    Calcula score ponderado de una versión según playbook.

    Args:
        q: Serie/dict con datos de cotización (avg_margin, gross_profit)
        health: Estado de salud ("verde", "amarillo", "rojo")
        playbook_name: Nombre del playbook

    Returns:
        float: Score ponderado (0-100)
    """
    pb = PLAYBOOKS.get(playbook_name, PLAYBOOKS["General"])

    # Normalizar health a score
    health_score = {"verde": 100, "amarillo": 60, "rojo": 20}.get(health, 0)

    # Normalizar margen (ya está en porcentaje 0-100)
    margin_score = min(100, max(0, float(q.get("avg_margin", 0))))

    # Normalizar profit (asumimos $0-$100K como rango típico)
    profit_raw = float(q.get("gross_profit", 0))
    profit_score = min(100, max(0, (profit_raw / 1000) * 10))  # $10K = 100 puntos

    # Calcular score ponderado
    final_score = (
        pb["weights"]["health"] * health_score +
        pb["weights"]["margin"] * margin_score +
        pb["weights"]["profit"] * profit_score
    )

    return round(final_score, 2)

def generate_comparison_narrative(q1, q2, df1, df2, playbook_name="General"):
    """
    Genera narrativa estructurada sobre la comparación entre dos versiones.

    Args:
        q1: Serie con datos de versión 1
        q2: Serie con datos de versión 2
        df1: DataFrame con líneas de versión 1
        df2: DataFrame con líneas de versión 2
        playbook_name: Nombre del playbook usado

    Returns:
        Dict con narrativa ejecutiva y detallada
    """
    # Asegurar que service_origin tenga un valor por defecto
    df1 = df1.copy()
    df2 = df2.copy()
    df1["service_origin"] = df1["service_origin"].fillna("Sin especificar").replace("", "Sin especificar")
    df2["service_origin"] = df2["service_origin"].fillna("Sin especificar").replace("", "Sin especificar")
    
    narrative_exec = []
    narrative_detail = []

    # Obtener configuración del playbook
    pb = PLAYBOOKS.get(playbook_name, PLAYBOOKS["General"])

    # Calcular salud de cada versión con playbook
    health_v1 = calculate_health_status(float(q1["avg_margin"]), float(q1["total_revenue"]), playbook_name, df1)
    health_v2 = calculate_health_status(float(q2["avg_margin"]), float(q2["total_revenue"]), playbook_name, df2)

    # Calcular scores para recomendación inteligente
    score_v1 = score_version(q1, health_v1, playbook_name)
    score_v2 = score_version(q2, health_v2, playbook_name)

    # --- Contexto de playbook (si no es General)
    if playbook_name != "General":
        narrative_exec.append(
            f"📘 Análisis bajo playbook '{playbook_name}' (verde: {pb['green']}%, amarillo: {pb['yellow']}%)"
        )

    # --- Benchmark de industria
    avg_margin_v2 = float(q2["avg_margin"])
    if avg_margin_v2 >= pb["green"]:
        benchmark_msg = f"✅ Margen {avg_margin_v2:.1f}% supera benchmark verde ({pb['green']}%)"
    elif avg_margin_v2 >= pb["yellow"]:
        gap_to_green = pb["green"] - avg_margin_v2
        benchmark_msg = f"🟡 Margen {avg_margin_v2:.1f}% está {gap_to_green:.1f}pp por debajo de verde"
    else:
        gap_to_yellow = pb["yellow"] - avg_margin_v2
        benchmark_msg = f"🔴 Margen {avg_margin_v2:.1f}% está {gap_to_yellow:.1f}pp por debajo de mínimo"

    narrative_detail.append(benchmark_msg)

    # --- Cambios financieros
    delta_revenue = float(q2["total_revenue"]) - float(q1["total_revenue"])
    delta_profit = float(q2["gross_profit"]) - float(q1["gross_profit"])
    delta_margin = float(q2["avg_margin"]) - float(q1["avg_margin"])

    if delta_revenue > 0:
        narrative_exec.append(
            f"La versión v{int(q2['version'])} incrementó el ingreso en ${round(delta_revenue, 2):,.2f}."
        )
    elif delta_revenue < 0:
        narrative_exec.append(
            f"La versión v{int(q2['version'])} redujo el ingreso en ${round(abs(delta_revenue), 2):,.2f}."
        )
    else:
        narrative_exec.append(
            f"La versión v{int(q2['version'])} mantuvo el mismo nivel de ingreso."
        )

    if delta_margin < 0:
        narrative_exec.append(
            f"El margen promedio disminuyó {round(abs(delta_margin), 2):.2f} puntos porcentuales."
        )
    elif delta_margin > 0:
        narrative_exec.append(
            f"El margen promedio mejoró {round(delta_margin, 2):.2f} puntos porcentuales."
        )
    else:
        narrative_exec.append(
            f"El margen promedio se mantuvo estable."
        )

    # --- Salud general
    if health_v2 != health_v1:
        narrative_exec.append(
            f"La salud general pasó de {health_v1.upper()} a {health_v2.upper()}."
        )
    else:
        narrative_detail.append(
            f"La salud se mantuvo en nivel {health_v1.upper()}."
        )

    # --- Análisis por origen de servicio
    comp1 = df1.groupby("service_origin")["final_price_unit"].sum()
    comp2 = df2.groupby("service_origin")["final_price_unit"].sum()

    comp_delta = (comp2 - comp1).fillna(comp2).fillna(0)

    top_change = comp_delta.abs().sort_values(ascending=False)

    if not top_change.empty and top_change.iloc[0] != 0:
        main_component = top_change.index[0]
        value = comp_delta[main_component]

        direction = "incrementó" if value > 0 else "redujo"
        narrative_detail.append(
            f"El origen/tipo de servicio '{main_component}' {direction} su aportación en ${round(abs(value), 2):,.2f}."
        )

    # --- Cambios en número de líneas
    delta_lines = len(df2) - len(df1)
    if delta_lines > 0:
        narrative_detail.append(
            f"Se agregaron {delta_lines} línea(s) nueva(s)."
        )
    elif delta_lines < 0:
        narrative_detail.append(
            f"Se eliminaron {abs(delta_lines)} línea(s)."
        )

    # --- Líneas en riesgo
    red_lines_v2 = (df2["margin_pct"] < 20).sum()
    if red_lines_v2 > 0:
        narrative_detail.append(
            f"⚠️ La versión v{int(q2['version'])} contiene {red_lines_v2} línea(s) con margen crítico (<20%)."
        )

    # --- Análisis de utilidad
    if delta_profit > 0 and delta_revenue > 0:
        narrative_detail.append(
            f"✅ Cambio estructuralmente positivo: más ingreso (+${round(delta_revenue, 2):,.2f}) y mayor utilidad (+${round(delta_profit, 2):,.2f})."
        )
    elif delta_profit < 0 and delta_revenue > 0:
        narrative_detail.append(
            f"⚠️ Crecimiento costoso: más ingreso pero menor utilidad (-${round(abs(delta_profit), 2):,.2f})."
        )
    elif delta_profit > 0 and delta_revenue < 0:
        narrative_detail.append(
            f"🎯 Optimización: menos ingreso pero mejor utilidad (+${round(delta_profit, 2):,.2f})."
        )

    # --- Recomendación basada en score ponderado
    if score_v2 > score_v1:
        score_diff = score_v2 - score_v1
        recommendation = f"✅ Recomendación: Usar v{int(q2['version'])} (score: {score_v2:.1f} vs {score_v1:.1f}, +{score_diff:.1f}pts)"
    elif score_v1 > score_v2:
        score_diff = score_v1 - score_v2
        recommendation = f"⚠️ Recomendación: Mantener v{int(q1['version'])} (score: {score_v1:.1f} vs {score_v2:.1f}, +{score_diff:.1f}pts)"
    else:
        recommendation = f"⚖️ Ambas versiones equivalentes (score: {score_v1:.1f})"

    narrative_exec.append(recommendation)

    # Agregar info de pesos del playbook al detalle
    weights_info = f"🎯 Pesos: Salud {pb['weights']['health']*100:.0f}%, Margen {pb['weights']['margin']*100:.0f}%, Ganancia {pb['weights']['profit']*100:.0f}%"
    narrative_detail.append(weights_info)

    return {
        "executive": " ".join(narrative_exec),
        "detail": " ".join(narrative_detail) if narrative_detail else "Sin cambios significativos en el detalle.",
        "health_v1": health_v1,
        "health_v2": health_v2,
        "score_v1": score_v1,
        "score_v2": score_v2
    }

# =========================
# IA para Reformulación de Narrativas
# =========================
def build_ai_prompt(audience, executive_text, detail_text):
    """
    Construye prompt para IA que SOLO reformula (no calcula, no recomienda).

    Args:
        audience: Tipo de audiencia objetivo
        executive_text: Narrativa ejecutiva estructurada
        detail_text: Narrativa detallada

    Returns:
        Prompt para LLM
    """
    return f"""Eres un asistente que SOLO reformula texto para diferentes audiencias.

IMPORTANTE - NO PUEDES:
- Cambiar cifras o números
- Agregar recomendaciones nuevas
- Interpretar o añadir juicios
- Inventar información

SOLO PUEDES:
- Ajustar el tono según la audiencia
- Reorganizar información existente
- Mejorar claridad manteniendo hechos

Audiencia objetivo: {audience}

Texto base ejecutivo:
{executive_text}

Detalle técnico:
{detail_text}

Instrucciones:
1. Mantén TODAS las cifras exactamente iguales
2. No agregues juicios nuevos
3. Ajusta SOLO el tono y claridad según la audiencia
4. Devuelve un texto de máximo 2 párrafos
5. Si la audiencia es "Cliente ejecutivo": enfoca en valor de negocio
6. Si la audiencia es "Comité financiero": enfoca en métricas y riesgos
7. Si la audiencia es "Uso interno (ventas)": usa lenguaje directo y accionable

Responde SOLO con el texto reformulado, sin explicaciones adicionales."""

def ai_rewrite_narrative(audience, executive, detail):
    """
    Reformula narrativa usando IA según audiencia.

    IMPORTANTE: Esta función NO cambia números ni recomendaciones.
    Solo ajusta tono y presentación.

    Args:
        audience: Tipo de audiencia
        executive: Narrativa ejecutiva
        detail: Narrativa detallada

    Returns:
        Texto reformulado o placeholder si IA no disponible
    """
    # Verificar si OpenAI está habilitado
    if st.session_state.get('openai_enabled', False):
        try:
            from openai import OpenAI

            api_key = st.session_state.get('openai_api_key')
            if not api_key or not api_key.strip():
                return f"""[Reformulación no disponible - API Key vacía]

{executive}

Detalle: {detail}"""

            client = OpenAI(api_key=api_key)

            prompt = build_ai_prompt(audience, executive, detail)

            with st.spinner("🤖 Reformulando narrativa con IA..."):
                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {
                            "role": "system",
                            "content": "Eres un asistente experto en comunicación empresarial que reformula textos manteniendo precisión factual absoluta."
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    temperature=0.3,  # Baja temperatura para consistencia
                    max_tokens=400,
                    timeout=15.0
                )

            return response.choices[0].message.content.strip()

        except ImportError:
            return f"""[Librería OpenAI no disponible]

{executive}

Detalle: {detail}"""

        except Exception as e:
            error_msg = str(e)
            if "api_key" in error_msg.lower() or "authentication" in error_msg.lower():
                return f"""[Error: API Key inválida]

{executive}

Detalle: {detail}"""
            else:
                return f"""[Error en reformulación IA: {error_msg[:50]}]

{executive}

Detalle: {detail}"""

    else:
        # Placeholder cuando OpenAI no está habilitado
        return f"""[Reformulación para: {audience}]

{executive}

{detail}

Nota: Habilita OpenAI en la barra lateral para reformulación inteligente."""

# =========================
# DB Init
# =========================
success, message = init_database()
if not success:
    st.error(message)
    st.stop()

# Ejecutar migraciones automáticamente
from database import run_migrations
migration_success, migration_message = run_migrations()
if not migration_success:
    st.warning(f"⚠️ Algunas migraciones no se ejecutaron correctamente: {migration_message}")

# Mostrar info de base de datos
db_info = get_database_info()
st.sidebar.markdown(f"{db_info['icon']} **Base de datos:** {db_info['type']}")
st.sidebar.caption(f"Conexión: {db_info['connection']}")

# Debug info en sidebar (expandible)
with st.sidebar.expander("🔍 Debug Info", expanded=False):
    st.caption("**Secrets disponibles:**")
    if hasattr(st, 'secrets'):
        secrets_keys = list(st.secrets.keys()) if hasattr(st.secrets, 'keys') else []
        if secrets_keys:
            st.code(", ".join(secrets_keys))
        else:
            st.warning("No hay secrets configurados")
        
        if 'DATABASE_URL' in st.secrets:
            db_url = st.secrets['DATABASE_URL']
            st.success(f"✅ DATABASE_URL encontrada")
            st.caption(f"Inicia con: {db_url[:30]}...")
        else:
            st.error("❌ DATABASE_URL NO encontrada en secrets")
            st.info("Configura en: Manage app > Settings > Secrets")
    else:
        st.warning("st.secrets no está disponible")

# =========================
# Session state
# =========================
if "quote_id" not in st.session_state:
    st.session_state.quote_id = str(uuid.uuid4())

if "quote_group_id" not in st.session_state:
    st.session_state.quote_group_id = str(uuid.uuid4())

if "version" not in st.session_state:
    st.session_state.version = 1

if "parent_quote_id" not in st.session_state:
    st.session_state.parent_quote_id = None

if "lines" not in st.session_state:
    st.session_state.lines = []

if "pending_line" not in st.session_state:
    st.session_state.pending_line = None

# Inicializar campos de información de cotización directamente con los keys de los inputs
if "input_proposal_name" not in st.session_state:
    st.session_state.input_proposal_name = ""

if "input_client_name" not in st.session_state:
    st.session_state.input_client_name = ""

if "input_quoted_by" not in st.session_state:
    st.session_state.input_quoted_by = ""

# Inicializar variables de respaldo para persistencia
if "saved_proposal_name" not in st.session_state:
    st.session_state.saved_proposal_name = ""

if "saved_client_name" not in st.session_state:
    st.session_state.saved_client_name = ""

if "saved_quoted_by" not in st.session_state:
    st.session_state.saved_quoted_by = ""

# =========================
# TAB: COTIZACIONES Y PROPUESTAS (COMBINADO)
# =========================
with tab_quotes:
    st.header("💼 Cotizaciones y Propuestas")
    st.caption("Sistema integrado para cotizar y generar propuestas formales")
    st.divider()

    # Radio buttons para seleccionar sección (mantiene estado entre reruns)
    seccion = st.radio(
        "Selecciona la acción:",
        ["📝 Crear Cotización", "📄 Generar Propuesta Formal"],
        horizontal=True,
        key="seccion_activa_quotes"
    )
    
    st.divider()

    # =========================
    # SECCIÓN: COTIZADOR
    # =========================
    if seccion == "📝 Crear Cotización":
        st.subheader("📝 Cotizador Universal")

        _qmode = st.session_state.get('quote_start_mode')

        # ==========================================================
        # LANDING: elegir modo de inicio (aparece al entrar limpio)
        # ==========================================================
        if _qmode is None:
            st.markdown("")
            st.markdown("### ¿Cómo deseas comenzar?")
            st.markdown("")
            col_l, col_r, _col_sp = st.columns([2, 2, 1])
            with col_l:
                st.markdown("""
                <div style="border:2px solid #1976D2;border-radius:12px;
                            padding:28px;text-align:center;background:#E3F2FD;">
                <h3 style="margin:0 0 8px 0;">🆕 Nueva Propuesta</h3>
                <p style="margin:0;color:#555;">Crea una cotización desde cero</p>
                </div>
                """, unsafe_allow_html=True)
                st.markdown("")
                if st.button("Crear Nueva Propuesta", type="primary",
                             use_container_width=True, key="btn_modo_nueva"):
                    st.session_state['quote_start_mode'] = 'nueva'
                    st.rerun()
            with col_r:
                st.markdown("""
                <div style="border:2px solid #F57C00;border-radius:12px;
                            padding:28px;text-align:center;background:#FFF3E0;">
                <h3 style="margin:0 0 8px 0;">📋 Nueva Versión</h3>
                <p style="margin:0;color:#555;">
                Toma una propuesta existente como base y crea una versión mejorada
                </p>
                </div>
                """, unsafe_allow_html=True)
                st.markdown("")
                if st.button("Nueva Versión de Propuesta Existente", type="secondary",
                             use_container_width=True, key="btn_modo_v2"):
                    st.session_state['quote_start_mode'] = 'v2'
                    st.rerun()

        # ==========================================================
        # MODO V2: seleccionar y desglosar propuesta base
        # ==========================================================
        elif _qmode == 'v2' and not st.session_state.lines:
            col_back, _ = st.columns([1, 5])
            with col_back:
                if st.button("← Volver", key="btn_volver_landing_v2"):
                    st.session_state.pop('quote_start_mode', None)
                    st.rerun()

            st.subheader("📋 Nueva Versión – Seleccionar propuesta base")
            st.caption("Busca la propuesta original, revisa su contenido y cópiala para crear la nueva versión.")

            selected_group_id = render_quote_search_selector(
                key="asociar_existente",
                label="🔍 Buscar propuesta",
                show_recent=True
            )

            if selected_group_id:
                group_data = get_quote_by_group_id(selected_group_id)

                if group_data:
                    versions_df = load_versions_for_group(selected_group_id)
                    current_max_version = versions_df['version'].max() if not versions_df.empty else 1
                    next_version = current_max_version + 1

                    st.divider()
                    st.subheader("📂 Desglose de la propuesta seleccionada")

                    col_d1, col_d2, col_d3 = st.columns(3)
                    col_d1.metric("👤 Cliente", group_data.get('client_name') or '—')
                    col_d2.metric("📄 Propuesta", group_data.get('proposal_name') or 'Sin nombre')
                    col_d3.metric("🔢 Versiones existentes", len(versions_df))

                    if not versions_df.empty:
                        with st.expander(f"Historial de versiones ({len(versions_df)})", expanded=True):
                            ver_cols = [c for c in ['version', 'created_at', 'status', 'total_revenue', 'avg_margin']
                                        if c in versions_df.columns]
                            rename_map = {'version': 'Versión', 'created_at': 'Fecha',
                                          'status': 'Estado', 'total_revenue': 'Total', 'avg_margin': 'Margen%'}
                            st.dataframe(versions_df[ver_cols].rename(columns=rename_map),
                                         use_container_width=True, hide_index=True)

                    lines_preview = get_quote_lines(group_data["quote_id"])
                    if lines_preview:
                        st.markdown(f"**📦 Líneas de la versión más reciente (v{current_max_version}) — {len(lines_preview)} ítems:**")
                        preview_df = pd.DataFrame(
                            lines_preview,
                            columns=["SKU", "Descripción", "Tipo", "Origen",
                                     "Costo Unit.", "Precio Unit.", "Margen %", "Estrategia", "Advertencias"]
                        )
                        st.dataframe(preview_df, use_container_width=True)
                    else:
                        st.info("Esta propuesta no tiene líneas registradas.")

                    st.divider()
                    st.info(f"Se creará la **v{next_version}** de esta propuesta. "
                            "Podrás modificar líneas, precios y agregar nuevos ítems antes de guardar.")

                    if lines_preview and st.button(f"📋 Copiar propuesta y crear v{next_version}",
                                                   type="primary", key="btn_copiar_v2"):
                        latest_quote_id = group_data["quote_id"]
                        quote_lines_raw = get_quote_lines_full(latest_quote_id)
                        st.session_state.lines = []

                        _cols_v2 = ["line_id", "quote_id", "sku", "quantity", "description_original",
                                    "description_final", "description_corrections", "line_type",
                                    "service_origin", "cost_unit", "final_price_unit", "margin_pct",
                                    "strategy", "warnings", "created_at", "import_source", "import_batch_id"]

                        for row in quote_lines_raw:
                            line_dict = dict(zip(_cols_v2, row))
                            line_dict['line_id'] = str(uuid.uuid4())
                            line_dict['created_at'] = datetime.now(UTC).isoformat()
                            line_dict['description_input'] = str(line_dict.get('description_original', ''))
                            line_dict['corrected_desc'] = str(line_dict.get('description_final', ''))
                            line_dict['corrections'] = (line_dict.get('description_corrections', '').split(', ')
                                                         if line_dict.get('description_corrections') else [])
                            line_dict['quantity'] = float(line_dict.get('quantity', 1))
                            line_dict['sku'] = str(line_dict.get('sku', ''))
                            line_dict['description_original'] = str(line_dict.get('description_original', ''))
                            line_dict['description_final'] = str(line_dict.get('description_final', ''))
                            line_dict['description_corrections'] = str(line_dict.get('description_corrections', ''))
                            line_dict['line_type'] = str(line_dict.get('line_type', ''))
                            line_dict['service_origin'] = str(line_dict.get('service_origin', ''))
                            line_dict['cost_unit'] = float(line_dict.get('cost_unit', 0))
                            line_dict['final_price_unit'] = float(line_dict.get('final_price_unit', 0))
                            line_dict['margin_pct'] = (float(line_dict.get('margin_pct', 0))
                                                        if line_dict.get('margin_pct') is not None else 0.0)
                            line_dict['strategy'] = str(line_dict.get('strategy', ''))
                            line_dict['warnings'] = str(line_dict.get('warnings', ''))
                            line_dict['import_source'] = str(line_dict.get('import_source', 'manual'))
                            line_dict['import_batch_id'] = (str(line_dict.get('import_batch_id', ''))
                                                             if line_dict.get('import_batch_id') else None)
                            st.session_state.lines.append(line_dict)

                        st.session_state.quote_id = str(uuid.uuid4())
                        st.session_state.quote_group_id = selected_group_id
                        st.cache_data.clear()
                        all_versions_for_group = load_versions_for_group(selected_group_id)
                        max_version = all_versions_for_group["version"].max() if not all_versions_for_group.empty else 0
                        st.session_state.version = max_version + 1
                        st.session_state.parent_quote_id = latest_quote_id
                        st.session_state.saved_proposal_name = group_data.get("proposal_name", "") or ""
                        st.session_state.saved_client_name = group_data.get("client_name", "") or ""
                        st.session_state.saved_quoted_by = group_data.get("quoted_by", "") or ""

                        st.success(f"✅ {len(quote_lines_raw)} líneas copiadas. "
                                   f"Se creará la v{st.session_state.version}. "
                                   "Modifica lo necesario y guarda.")
                        st.rerun()
                else:
                    st.warning("No se encontró información de la propuesta seleccionada.")

        # ==========================================================
        # MODO COTIZADOR: nueva propuesta o v2 con datos ya cargados
        # ==========================================================
        else:
            # Botón de reinicio + badge de versión
            _col_hdr, _col_btn = st.columns([5, 1])
            with _col_btn:
                if st.button("🔄 Reiniciar", key="btn_reset_cotizador",
                             help="Descartar esta cotización y volver al inicio"):
                    _keep_keys = {'authenticated', 'current_user', 'saved_quoted_by',
                                  'openai_enabled', 'openai_api_key', 'seccion_activa_quotes'}
                    for _k in list(st.session_state.keys()):
                        if _k not in _keep_keys:
                            st.session_state.pop(_k, None)
                    st.rerun()

            if _qmode == 'v2' and st.session_state.get('parent_quote_id'):
                vnum = st.session_state.get('version', '?')
                pname = st.session_state.get('saved_proposal_name', '')
                st.info(f"📋 Editando **nueva versión (v{vnum})** basada en: *{pname}*")

            # Mostrar banner si hay versión pendiente desde Base de Datos
            if st.session_state.get('pending_new_version', False):
                st.success(f"""
                ✅ **Nueva versión cargada:** {st.session_state.get('pending_version_info', '')}

                Se copiaron **{len(st.session_state.lines)}** líneas. Modifica lo necesario y presiona "Guardar Cotización".
                """)
                st.session_state.pending_new_version = False

            # Información de la cotización
            st.subheader("📋 Información de la Cotización")

            # Callbacks para persistir en tiempo real (sin necesidad de botón Confirmar)
            def _sync_proposal_name():
                st.session_state.saved_proposal_name = st.session_state.get('_input_proposal_name', '')
            def _sync_client_name():
                st.session_state.saved_client_name = st.session_state.get('_input_client_name', '')
            def _sync_quoted_by():
                st.session_state.saved_quoted_by = st.session_state.get('_input_quoted_by', '')

            st.text_input(
                "Nombre de la Propuesta",
                value=st.session_state.get('saved_proposal_name', ''),
                placeholder="Ej: Implementación ERP 2026, Soporte Anual...",
                help="Dale un nombre identificable a esta propuesta",
                key="_input_proposal_name",
                on_change=_sync_proposal_name
            )

            col_form1, col_form2 = st.columns(2)
            with col_form1:
                st.text_input(
                    "Cliente / Empresa",
                    value=st.session_state.get('saved_client_name', ''),
                    placeholder="Ej: Acme Corp, Juan Pérez...",
                    help="Para quién es esta cotización",
                    key="_input_client_name",
                    on_change=_sync_client_name
                )
            with col_form2:
                st.text_input(
                    "Cotizado por (User ID / Nombre)",
                    value=st.session_state.get('saved_quoted_by', ''),
                    placeholder="Ej: jperez, vendedor@empresa.com, Juan Pérez...",
                    help="Identificador de quién crea esta cotización",
                    key="_input_quoted_by",
                    on_change=_sync_quoted_by
                )
    # Mostrar maquinaria del cotizador sólo cuando hay un modo activo con datos cargados
        _qm_outer = st.session_state.get('quote_start_mode')
        _show_cotizador = (_qm_outer is not None and
                           not (_qm_outer == 'v2' and not st.session_state.lines))

        # Si hay una línea pendiente de confirmación (con correcciones)
        if _show_cotizador and st.session_state.pending_line:
            st.warning("🔍 Se detectaron posibles errores ortográficos en la descripción")

            pending = st.session_state.pending_line
            col1, col2 = st.columns(2)
            with col1:
                st.markdown("**📝 Original:**")
                st.info(pending["description_input"])
            with col2:
                st.markdown("**✨ Sugerencia:**")
                st.success(pending["corrected_desc"])

            st.markdown("**🔧 Cambios detectados:**")
            for correction in pending["corrections"]:
                st.caption(f"  • {correction}")

            st.divider()
            st.subheader("✏️ Editar antes de consolidar")

            with st.form("confirm_line_legacy"):
                # SKU editable
                edit_sku = st.text_input(
                    "SKU (editable)",
                    value=pending["sku"],
                    help="Puedes modificar el SKU antes de agregar la línea"
                )

                # Descripción editable - permitir elegir qué versión usar como base
                desc_option = st.radio(
                    "Selecciona la base para la descripción:",
                    ["Usar versión corregida", "Usar versión original"],
                    horizontal=True
                )

                if desc_option == "Usar versión corregida":
                    default_desc = pending["corrected_desc"]
                else:
                    default_desc = pending["description_input"]

                edit_description = st.text_area(
                    "Descripción final (editable)",
                    value=default_desc,
                    height=100,
                    help="Puedes modificar la descripción antes de agregar la línea"
                )

                col_a, col_b, col_c = st.columns([2, 2, 1])
                with col_a:
                    confirm_btn = st.form_submit_button("✅ Consolidar línea", type="primary")
                with col_b:
                    cancel_btn = st.form_submit_button("❌ Cancelar")

                if confirm_btn:
                    if not edit_description or not edit_description.strip():
                        st.error("❌ La descripción no puede estar vacía")
                    elif not edit_sku or not edit_sku.strip():
                        st.error("❌ El SKU no puede estar vacío")
                    else:
                        # Verificar si el SKU editado ya existe
                        existing_skus = [line["sku"] for line in st.session_state.lines]
                        if edit_sku != pending["sku"] and edit_sku in existing_skus:
                            st.error(f"❌ El SKU '{edit_sku}' ya existe en esta cotización")
                        else:
                            # Actualizar datos editados
                            pending["sku"] = edit_sku
                            pending["description_final"] = edit_description
                            st.session_state.lines.append(pending)
                            st.session_state.pending_line = None
                            st.success("✅ Línea consolidada exitosamente")
                            st.rerun()

                if cancel_btn:
                    st.session_state.pending_line = None
                    st.info("❌ Línea descartada")
                    st.rerun()

            st.divider()

        elif _show_cotizador:
            # =========================
            # IMPORTACIÓN DESDE EXCEL
            # =========================
            with st.expander("📥 Importar múltiples líneas desde Excel", expanded=False):
                st.markdown("""
                Importa productos desde Excel para acelerar la creación de cotizaciones.
                
                **Pasos:**
                1. Descarga la plantilla Excel
                2. Llena tus productos
                3. Sube el archivo
                4. Revisa y confirma
                """)
                
                # Botón de descarga del template
                col_download, col_upload = st.columns(2)
                
                with col_download:
                    try:
                        with open("templates/import/dynamiquote_simple.xlsx", "rb") as template_file:
                            st.download_button(
                                label="📄 Descargar Plantilla Excel",
                                data=template_file,
                                file_name="dynamiquote_productos.xlsx",
                                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                help="Descarga la plantilla, llénala y súbela de vuelta"
                            )
                    except FileNotFoundError:
                        st.error("❌ Plantilla no encontrada. Contacta al administrador.")
                
                with col_upload:
                    uploaded_file = st.file_uploader(
                        "📁 Subir Excel completado",
                        type=['xlsx'],
                        help="Solo archivos .xlsx",
                        key="excel_upload"
                    )
                
                if uploaded_file is not None:
                    # Procesar archivo
                    with st.spinner("Procesando Excel..."):
                        import_result = import_excel_file(
                            uploaded_file.getvalue(),
                            uploaded_file.name,
                            existing_lines=st.session_state.lines
                        )
                    
                    if not import_result["success"]:
                        st.error(import_result["error"])
                        if import_result["validation_report"]:
                            with st.expander("Ver detalles de errores"):
                                st.markdown(format_validation_report(import_result["validation_report"]))
                    else:
                        # Mostrar resumen
                        report = import_result["validation_report"]
                        col1, col2, col3 = st.columns(3)
                        
                        with col1:
                            st.metric("📊 Total Filas", report["total_rows"])
                        with col2:
                            st.metric("✅ Válidas", report["valid_rows"], delta_color="normal")
                        with col3:
                            st.metric("❌ Con Errores", report["error_rows"], delta_color="inverse")
                        
                        # Alertas de duplicados
                        if import_result.get("duplicates"):
                            st.warning(f"⚠️ Se detectaron {len(import_result['duplicates'])} posibles duplicados")
                            with st.expander("Ver duplicados detectados"):
                                for dup in import_result["duplicates"]:
                                    st.caption(f"• Nueva: '{dup['new']}' → Existente: '{dup['existing']}' (similitud: {dup['ratio']:.0%})")
                        
                        # Reporte de validación
                        with st.expander("📋 Reporte de Validación Completo"):
                            st.markdown(format_validation_report(report))
                        
                        # Preview editable
                        st.subheader("👀 Preview - Edita antes de confirmar")
                        st.caption("Puedes modificar los datos antes de importarlos")
                        
                        # Preparar datos para el editor
                        preview_data = []
                        for line in import_result["lines"]:
                            preview_data.append({
                                "SKU": line.get("sku", ""),
                                "Descripción": line.get("description_original", ""),
                                "Cantidad": line.get("_cantidad", 1),
                                "Costo": line.get("cost_unit", 0),
                                "Margen%": line.get("margin_pct", 0),
                                "Precio": line.get("final_price_unit", 0),
                                "Tipo": line.get("line_type", "product"),
                                "Origen": line.get("service_origin", "profesional"),
                                "Estrategia": line.get("strategy", "penetration")
                            })
                        
                        preview_df = pd.DataFrame(preview_data)
                        
                        # Editor interactivo
                        edited_data = st.data_editor(
                            preview_df,
                            column_config={
                                "SKU": st.column_config.TextColumn("SKU", width="small"),
                                "Descripción": st.column_config.TextColumn("Descripción", width="large"),
                                "Cantidad": st.column_config.NumberColumn("Cantidad", min_value=1, format="%d"),
                                "Costo": st.column_config.NumberColumn("Costo", min_value=0, format="$%.2f"),
                                "Margen%": st.column_config.NumberColumn("Margen%", min_value=0, max_value=99, format="%.1f"),
                                "Precio": st.column_config.NumberColumn("Precio", min_value=0, format="$%.2f"),
                                "Tipo": st.column_config.SelectboxColumn("Tipo", options=["product", "service"]),
                                "Origen": st.column_config.SelectboxColumn(
                                    "Clasificación",
                                    options=["doméstico", "profesional", "accesorios", "refacciones", "servicios", "póliza"]
                                ),
                                "Estrategia": st.column_config.SelectboxColumn(
                                    "Estrategia",
                                    options=["penetration", "defense", "upsell", "renewal"]
                                )
                            },
                            num_rows="dynamic",
                            width='stretch',
                            hide_index=False,
                            key=f"preview_editor_{import_result['import_batch_id']}"
                        )
                        
                        # Guardar cambios en session_state
                        st.session_state.edited_import_data = edited_data
                        
                        # Recalcular con datos editados
                        st.markdown("---")
                        st.subheader("💰 Resumen Final (con datos editados)")
                        
                        final_data = []
                        for idx in range(len(edited_data)):
                            costo = float(edited_data.iloc[idx]["Costo"])
                            margen = float(edited_data.iloc[idx]["Margen%"])
                            precio = float(edited_data.iloc[idx]["Precio"])
                            
                            # Recalcular precio basado en costo y margen
                            if costo > 0 and margen > 0:
                                precio_calculado = round(costo / (1 - margen / 100), 2)
                                # Verificar coherencia
                                if abs(precio - precio_calculado) > 0.01:
                                    # Usar precio calculado
                                    precio = precio_calculado
                                    margen_final = margen
                                else:
                                    margen_final = margen
                            else:
                                margen_final = margen
                            
                            final_data.append({
                                "SKU": edited_data.iloc[idx]["SKU"],
                                "Descripción": edited_data.iloc[idx]["Descripción"],
                                "Cantidad": int(edited_data.iloc[idx]["Cantidad"]),
                                "Costo": f"${costo:.2f}",
                                "Margen": f"{margen_final:.1f}%",
                                "Precio": f"${precio:.2f}",
                                "Tipo": edited_data.iloc[idx]["Tipo"]
                            })
                        
                        final_df = pd.DataFrame(final_data)
                        st.dataframe(final_df, width='stretch', hide_index=False)
                        
                        st.success(f"✅ {len(final_df)} líneas listas para importar")
                        
                        # Botones de acción final
                        col_confirm, col_cancel = st.columns(2)
                        
                        with col_confirm:
                            if st.button("✅ Confirmar e Importar Todo", type="primary", key="confirm_import"):
                                # Aplicar ediciones finales
                                updated_lines = []
                                for idx in range(len(edited_data)):
                                    if idx < len(import_result["lines"]):
                                        line = import_result["lines"][idx].copy()
                                        
                                        # Aplicar cambios del editor
                                        costo = float(edited_data.iloc[idx]["Costo"])
                                        margen = float(edited_data.iloc[idx]["Margen%"])
                                        precio_calculado = round(costo / (1 - margen / 100), 2) if costo > 0 and margen > 0 else 0
                                        
                                        line["sku"] = str(edited_data.iloc[idx]["SKU"])
                                        line["description_original"] = str(edited_data.iloc[idx]["Descripción"])
                                        line["description_final"] = str(edited_data.iloc[idx]["Descripción"])
                                        line["description_corrections"] = ""
                                        line["quantity"] = int(edited_data.iloc[idx]["Cantidad"])
                                        line["line_type"] = str(edited_data.iloc[idx]["Tipo"])
                                        line["service_origin"] = str(edited_data.iloc[idx]["Origen"])
                                        line["strategy"] = str(edited_data.iloc[idx]["Estrategia"])
                                        line["cost_unit"] = costo
                                        line["margin_pct"] = margen
                                        line["final_price_unit"] = precio_calculado
                                        
                                        updated_lines.append(line)
                                
                                # Agregar a session state
                                st.session_state.lines.extend(updated_lines)
                                
                                # Guardar archivo para auditoría
                                file_id = import_result["import_batch_id"]
                                quote_id = st.session_state.quote_id
                                success_file, msg_file = save_import_file(
                                    file_id=file_id,
                                    quote_id=quote_id,
                                    filename=uploaded_file.name,
                                    uploaded_at=datetime.now(UTC).isoformat(),
                                    file_data=uploaded_file.getvalue(),
                                    file_size=import_result["file_info"]["size"],
                                    rows_imported=import_result["file_info"]["rows_imported"],
                                    rows_errors=import_result["file_info"]["rows_errors"]
                                )
                                
                                st.success(f"✅ {len(updated_lines)} líneas importadas correctamente")
                                st.rerun()
                        
                        with col_cancel:
                            if st.button("❌ Cancelar Importación", key="cancel_import"):
                                st.rerun()
            
            st.divider()
            
            # Solo mostrar el formulario de agregar si no hay línea pendiente
            st.subheader("➕ Agregar línea")

            with st.form("add_line", clear_on_submit=True):
                col1, col2, col3 = st.columns(3)

                with col1:
                    sku = st.text_input("SKU *")
                    description_input = st.text_input("Descripción *")
                    quantity = st.number_input("Cantidad *", min_value=0.01, value=1.0, step=1.0)
                    line_type = st.selectbox("Tipo de línea", ["product", "service"])

                with col2:
                    service_origin = st.selectbox(
                        "Clasificación",
                        ["doméstico", "profesional", "accesorios", "refacciones", "servicios", "póliza"],
                        help="Tipo o categoría del producto/servicio (para análisis de composición)"
                    )
                    cost = st.number_input("Costo unitario", min_value=0.0, step=0.01)
                    price = st.number_input("Precio unitario", min_value=0.0, step=0.01)

                with col3:
                    margin_target = st.number_input("Margen objetivo % (opcional)", min_value=0.0, max_value=99.0, step=0.1)
                    strategy = st.selectbox("Estrategia", ["penetration", "defense", "upsell", "renewal"])

                submit = st.form_submit_button("Agregar línea")

            # Procesar submit fuera del formulario
            if submit:
                # Validaciones
                if not sku or not sku.strip():
                    st.error("❌ SKU es obligatorio")
                    st.stop()

                if not description_input or not description_input.strip():
                    st.error("❌ Descripción es obligatoria")
                    st.stop()

                # Verificar SKU duplicado
                existing_skus = [line["sku"] for line in st.session_state.lines]
                if sku in existing_skus:
                    st.warning(f"⚠️ El SKU '{sku}' ya existe en esta cotización")

                # Corrección de descripción
                corrected_desc, corrections = suggest_description_fix(description_input)

                # Cálculos
                warnings = []
                margin_pct = None
                final_price = price

                if cost > 0 and price > 0:
                    margin_pct = round(((price - cost) / price) * 100, 2)
                elif cost > 0 and margin_target > 0:
                    final_price = round(cost / (1 - margin_target / 100), 2)
                    margin_pct = round(margin_target, 2)
                    warnings.append("Precio sugerido a partir de margen objetivo")
                else:
                    st.error("Debes ingresar costo + precio o costo + margen")
                    st.stop()

                # Preparar línea
                new_line = {
                    "line_id": str(uuid.uuid4()),
                    "sku": sku,
                    "quantity": quantity,
                    "description_original": description_input,
                    "description_input": description_input,
                    "description_final": None,  # Se definirá después
                    "description_corrections": ", ".join(corrections),
                    "corrected_desc": corrected_desc,
                    "corrections": corrections,
                    "line_type": line_type,
                    "service_origin": service_origin,
                    "cost_unit": cost,
                    "final_price_unit": final_price,
                    "margin_pct": margin_pct,
                    "strategy": strategy,
                    "warnings": ", ".join(warnings),
                    "created_at": datetime.now(UTC).isoformat()
                }

                # Si hay correcciones, guardar como pendiente
                if corrections:
                    st.session_state.pending_line = new_line
                    st.rerun()
                else:
                    # Sin correcciones, agregar directamente
                    new_line["description_final"] = description_input
                    st.session_state.lines.append(new_line)
                    st.success("✅ Línea agregada correctamente")
                    st.rerun()

        # Mostrar cotización si hay líneas
        if not st.session_state.lines:
            st.info("Agrega líneas para iniciar una cotización")
        else:
            st.divider()
            st.subheader("📊 Cotización en curso")

            df = pd.DataFrame(st.session_state.lines)

            # Asegurar que la columna quantity existe (para compatibilidad con líneas antiguas)
            if "quantity" not in df.columns:
                df["quantity"] = 1

            # Convertir a numérico para evitar errores
            df["cost_unit"] = pd.to_numeric(df["cost_unit"], errors='coerce').fillna(0)
            df["final_price_unit"] = pd.to_numeric(df["final_price_unit"], errors='coerce').fillna(0)
            df["margin_pct"] = pd.to_numeric(df["margin_pct"], errors='coerce').fillna(0)
            df["quantity"] = pd.to_numeric(df["quantity"], errors='coerce').fillna(1)

            # Calcular subtotales considerando cantidad
            df["subtotal_cost"] = df["cost_unit"] * df["quantity"]
            df["subtotal_price"] = df["final_price_unit"] * df["quantity"]

            total_cost = df["subtotal_cost"].sum()
            total_revenue = df["subtotal_price"].sum()
            gross_profit = total_revenue - total_cost
            gross_margin_pct = round((gross_profit / total_revenue * 100) if total_revenue > 0 else 0, 2)

            colA, colB, colC, colD = st.columns(4)
            colA.metric("Ingreso total", f"${round(total_revenue,2)}")
            colB.metric("Costo total", f"${round(total_cost,2)}")
            colC.metric("Utilidad bruta", f"${round(gross_profit,2)}")
            colD.metric("Margen bruto %", gross_margin_pct)

            # Asegurar que columnas categóricas sean strings (compatibilidad con selectbox)
            if "strategy" in df.columns:
                df["strategy"] = df["strategy"].astype(str).fillna("penetration")
            if "line_type" in df.columns:
                df["line_type"] = df["line_type"].astype(str).fillna("product")
            if "service_origin" in df.columns:
                df["service_origin"] = df["service_origin"].astype(str).fillna("Sin especificar").replace("", "Sin especificar")

            # Preparar DataFrame para mostrar con formato
            display_df = df[[
                "sku",
                "description_final",
                "quantity",
                "line_type",
                "service_origin",
                "strategy",
                "cost_unit",
                "final_price_unit",
                "subtotal_price",
                "margin_pct",
                "warnings"
            ]].copy()

            # Renombrar columnas para mejor presentación
            display_df.columns = [
                "SKU", "Descripción", "Cant.", "Tipo", "Origen", "Estrategia",
                "Costo Unit.", "Precio Unit.", "Subtotal", "Margen %", "Advertencias"
            ]

            # Mostrar tabla con opción de edición
            st.markdown("**💡 Tip:** Puedes editar las líneas directamente en la tabla. Los cambios se aplican al hacer clic fuera de la celda.")

            edited_df = st.data_editor(
                display_df,
                width='stretch',
                hide_index=False,
                num_rows="fixed",
                column_config={
                    "SKU": st.column_config.TextColumn("SKU", width="small"),
                    "Descripción": st.column_config.TextColumn("Descripción", width="large"),
                    "Cant.": st.column_config.NumberColumn("Cant.", min_value=0.01, step=1, format="%.2f"),
                    "Tipo": st.column_config.SelectboxColumn("Tipo", options=["product", "service"]),
                    "Origen": st.column_config.SelectboxColumn("Clasificación", options=["doméstico", "profesional", "accesorios", "refacciones", "servicios", "póliza"]),
                    "Estrategia": st.column_config.SelectboxColumn("Estrategia", options=["penetration", "defense", "upsell", "renewal"]),
                    "Costo Unit.": st.column_config.NumberColumn("Costo Unit.", min_value=0, step=0.01, format="$%.2f"),
                    "Precio Unit.": st.column_config.NumberColumn("Precio Unit.", min_value=0, step=0.01, format="$%.2f"),
                    "Subtotal": st.column_config.NumberColumn("Subtotal", disabled=True, format="$%.2f"),
                    "Margen %": st.column_config.NumberColumn("Margen %", format="%.2f%%"),
                    "Advertencias": st.column_config.TextColumn("Advertencias", disabled=True)
                }
            )

            # Aplicar cambios si hay ediciones
            if not edited_df.equals(display_df):
                if st.button("💾 Aplicar Cambios", type="primary"):
                    # Recalcular con los nuevos valores
                    for idx in range(len(edited_df)):
                        # Actualizar valores en session_state.lines
                        st.session_state.lines[idx]["sku"] = edited_df.iloc[idx]["SKU"]
                        st.session_state.lines[idx]["description_final"] = edited_df.iloc[idx]["Descripción"]
                        st.session_state.lines[idx]["quantity"] = float(edited_df.iloc[idx]["Cant."])
                        st.session_state.lines[idx]["line_type"] = edited_df.iloc[idx]["Tipo"]
                        st.session_state.lines[idx]["service_origin"] = edited_df.iloc[idx]["Origen"]
                        st.session_state.lines[idx]["strategy"] = edited_df.iloc[idx]["Estrategia"]
                        st.session_state.lines[idx]["cost_unit"] = float(edited_df.iloc[idx]["Costo Unit."])
                        st.session_state.lines[idx]["final_price_unit"] = float(edited_df.iloc[idx]["Precio Unit."])

                        # Recalcular margen
                        costo = float(edited_df.iloc[idx]["Costo Unit."])
                        precio = float(edited_df.iloc[idx]["Precio Unit."])
                        if precio > 0:
                            margen = round(((precio - costo) / precio) * 100, 2)
                            st.session_state.lines[idx]["margin_pct"] = margen

                    st.success("✅ Cambios aplicados correctamente")
                    st.rerun()

            # Botones de gestión de líneas
            col_delete, col_clear = st.columns(2)

            with col_delete:
                delete_indices = st.multiselect(
                    "Selecciona líneas para eliminar",
                    options=list(range(len(st.session_state.lines))),
                    format_func=lambda x: f"Línea {x+1}: {st.session_state.lines[x]['sku']}"
                )

                if delete_indices and st.button("🗑️ Eliminar Líneas Seleccionadas", type="secondary"):
                    # Eliminar en orden inverso para evitar problemas de índice
                    for idx in sorted(delete_indices, reverse=True):
                        st.session_state.lines.pop(idx)
                    st.success(f"✅ {len(delete_indices)} línea(s) eliminada(s)")
                    st.rerun()

            with col_clear:
                st.write("")  # Espaciado
                st.write("")  # Espaciado
                if st.button("🔄 Limpiar Todo", type="secondary"):
                    if st.session_state.lines:
                        st.session_state.lines = []
                        st.success("✅ Cotización limpiada")
                        st.rerun()

            # =========================
            # Gráficas lado a lado
            # =========================
            st.subheader("📊 Visualizaciones")

            col_graph1, col_graph2 = st.columns(2)

            with col_graph1:
                st.markdown("**Aportación por Origen de Servicio**")
                comp_df = df.groupby("service_origin")["subtotal_price"].sum().reset_index()
                fig1, ax1 = plt.subplots(figsize=(6, 4))
                ax1.pie(
                    comp_df["subtotal_price"],
                    labels=comp_df["service_origin"],
                    autopct="%1.1f%%",
                    startangle=90
                )
                ax1.set_title("Aportación total por origen de servicio")
                plt.tight_layout()
                st.pyplot(fig1)
                plt.close(fig1)  # Cerrar figura para liberar memoria

            with col_graph2:
                st.markdown("**Costo vs Utilidad Bruta**")
                fig2, ax2 = plt.subplots(figsize=(6, 4))
                ax2.pie(
                    [total_cost, gross_profit],
                    labels=["Costo", "Utilidad Bruta"],
                    autopct="%1.1f%%",
                    startangle=90
                )
                ax2.set_title("Distribución financiera")
                st.pyplot(fig2)
                plt.close(fig2)  # Cerrar figura para liberar memoria

            # =========================
            # Cerrar propuesta
            # =========================
            st.subheader("✅ Cerrar y guardar propuesta")

            # Opción para nueva oportunidad o continuar con versiones
            col_new_opp, col_playbook = st.columns([1, 2])

            with col_new_opp:
                new_opportunity = st.checkbox(
                    "🆕 Nueva oportunidad",
                    value=False,
                    help="Si está marcado, crea una nueva oportunidad. Si no, crea una nueva versión de la actual."
                )
                if new_opportunity:
                    st.caption("✨ Se creará oportunidad nueva")
                else:
                    st.caption(f"📝 Versión actual: v{st.session_state.version}")

            with col_playbook:
                save_playbook = st.selectbox(
                    "📘 Playbook a aplicar",
                    list(PLAYBOOKS.keys()),
                    help="El playbook determina cómo se evaluará esta cotización en comparaciones futuras"
                )
                pb_save = PLAYBOOKS[save_playbook]
                st.caption(f"Verde ≥{pb_save['green']}% | Amarillo ≥{pb_save['yellow']}%")

            save_button = st.button("💾 Guardar Cotización", type="primary", width='stretch')

            if save_button:
                # Verificar que hay líneas
                if not st.session_state.lines:
                    st.error("❌ No hay líneas para guardar")
                else:
                    # Usar valores sincronizados directamente
                    proposal_name_value = st.session_state.get('saved_proposal_name', '') or ''
                    client_name_value = st.session_state.get('saved_client_name', '') or ''
                    quoted_by_value = st.session_state.get('saved_quoted_by', '') or ''

                    # Preparar datos para guardar
                    quote_data = (
                        st.session_state.quote_id,
                        st.session_state.quote_group_id,
                        int(st.session_state.version),  # Convertir a int nativo de Python
                        st.session_state.parent_quote_id,
                        datetime.now(UTC).isoformat(),
                        "CLOSED",
                        float(total_cost),
                        float(total_revenue),
                        float(gross_profit),
                        float(gross_margin_pct),
                        save_playbook,
                        client_name_value or "Cliente sin nombre",
                        quoted_by_value or "Sin asignar",
                        proposal_name_value or "Sin nombre"
                    )

                    lines_data = []
                    for idx, line in enumerate(st.session_state.lines):
                        try:
                            line_tuple = (
                                str(line["line_id"]),
                                str(st.session_state.quote_id),
                                str(line["sku"]),
                                float(line.get("quantity", 1.0)),  # Ya está en float
                                str(line["description_original"]),
                                str(line["description_final"]),
                                str(line["description_corrections"]),
                                str(line["line_type"]),
                                str(line["service_origin"]),
                                float(line["cost_unit"]),
                                float(line["final_price_unit"]),
                                float(line["margin_pct"]) if line["margin_pct"] is not None else None,
                                str(line["strategy"]),
                                str(line["warnings"]),
                                str(line["created_at"]),
                                str(line.get("import_source", "manual")),
                                str(line.get("import_batch_id", "")) if line.get("import_batch_id") else None
                            )
                            lines_data.append(line_tuple)
                        except Exception as e:
                            st.error(f"❌ Error preparando línea {idx+1}: {e}")
                            st.write(f"Línea con error: {line}")
                            st.write(f"Tipo de error: {type(e).__name__}")
                            # DEBUG: Mostrar tipos de cada campo
                            st.write("**Tipos de datos en la línea:**")
                            for key, value in line.items():
                                st.write(f"- {key}: {type(value).__name__} = {value}")
                            raise

                    # Guardar usando función segura
                    success, message = save_quote(quote_data, lines_data)

                    if success:
                        st.success(message)
                        # Limpiar solo cachés de búsqueda (más eficiente que limpiar todo)
                        clear_search_caches()
                        
                        # Limpiar session_state de datos innecesarios
                        cleanup_session_state()

                        if new_opportunity:
                            # Nueva oportunidad: reiniciar todo
                            st.session_state.lines = []
                            st.session_state.quote_id = str(uuid.uuid4())
                            st.session_state.quote_group_id = str(uuid.uuid4())
                            st.session_state.version = 1
                            st.session_state.parent_quote_id = None
                            # Limpiar campos de información y sus keys de widget
                            st.session_state.saved_proposal_name = ""
                            st.session_state.saved_client_name = ""
                            st.session_state.saved_quoted_by = ""
                            for k in ['_input_proposal_name', '_input_client_name', '_input_quoted_by']:
                                st.session_state.pop(k, None)
                            st.info("🆕 Preparado para nueva oportunidad")
                            st.rerun()
                        else:
                            # Nueva versión de la misma oportunidad
                            current_group_id = st.session_state.quote_group_id
                            saved_quote_id = st.session_state.quote_id

                            # Calcular la siguiente versión correctamente: MAX(versiones) + 1
                            all_versions_for_group = load_versions_for_group(current_group_id)
                            max_version = all_versions_for_group["version"].max() if not all_versions_for_group.empty else 0
                            next_version = max_version + 1

                            st.session_state.lines = []
                            st.session_state.quote_id = str(uuid.uuid4())
                            st.session_state.quote_group_id = current_group_id
                            st.session_state.version = next_version
                            st.session_state.parent_quote_id = saved_quote_id
                            st.info(f"📝 Preparado para versión v{next_version}")

                        st.rerun()
                    else:
                        st.error(message)

        # Fin del bloque de Cotizador
        
        # =========================
        # SECCIÓN: PROPUESTAS FORMALES
        # =========================
    if seccion == "📄 Generar Propuesta Formal":
        st.subheader("📄 Generador de Propuestas Formales")

        # Selector de origen — primera sección visible
        st.subheader("1️⃣ Seleccionar Origen de la Propuesta")

        origin_type = st.radio(
            "¿Desde dónde quieres generar la propuesta?",
            ["Cotizador", "Propuesta Anterior (Nueva Versión)"],
            horizontal=True
        )

        source_id = None
        source_data = None
        existing_proposal = None

        if origin_type == "Cotizador":
            # Usar búsqueda optimizada
            selected_group_id = render_quote_search_selector(
                key="propuesta_formal_legacy",
                label="🔍 Buscar cotización",
                show_recent=True
            )
            
            if selected_group_id:
                # Obtener información del grupo
                group_data = get_quote_by_group_id(selected_group_id)
                if group_data:
                    # Validar que el diccionario tiene todos los campos necesarios
                    required_fields = ['quote_id', 'quote_group_id', 'version', 'created_at', 'status', 
                                     'total_revenue', 'avg_margin', 'playbook_name', 'client_name', 
                                     'proposal_name', 'quoted_by']
                    missing_fields = [f for f in required_fields if f not in group_data]
                    
                    if missing_fields:
                        st.error(f"⚠️ Error: La consulta retornó datos incompletos. Campos faltantes: {', '.join(missing_fields)}")
                        st.warning("💡 Esto puede indicar que la base de datos necesita actualización. Contacta al administrador.")
                        st.stop()
                        
                    source_id = group_data["quote_id"]
                    
                    # Mostrar resumen
                    col1, col2, col3 = st.columns(3)
                    col1.metric("Total", f"${group_data['total_revenue']:,.2f}")
                    col2.metric("Margen", f"{group_data['avg_margin']:.1f}%")
                    col3.metric("Estado", group_data['status'])
                    
                    # Guardar para uso posterior
                    source_data = (
                        source_id, group_data['quote_group_id'], group_data['version'],
                        None, group_data['created_at'], group_data['status'],
                        0, group_data['total_revenue'], 0, group_data['avg_margin'],
                        group_data['playbook_name'], group_data['client_name'],
                        group_data.get('quoted_by', 'Sin asignar'), group_data['proposal_name']
                    )

        elif origin_type == "Propuesta Anterior (Nueva Versión)":
            # Obtener propuestas disponibles
            from database import get_formal_proposals
            all_proposals = get_formal_proposals(created_by_filter=None if _is_admin else _current_user['alias'])

            if all_proposals:
                proposal_options = {
                    f"{p['proposal_number']} - {p['recipient_company']} - {p['issued_date']}": p['proposal_doc_id']
                    for p in all_proposals
                }

                selected_proposal = st.selectbox(
                    "Selecciona una propuesta anterior",
                    options=list(proposal_options.keys())
                )

                if selected_proposal:
                    proposal_id = proposal_options[selected_proposal]
                    from database import get_formal_proposal
                    existing_proposal = get_formal_proposal(proposal_id)

                    if existing_proposal:
                        source_id = existing_proposal.get('quote_id')

                        # Mostrar resumen
                        st.info(f"📄 **{existing_proposal['proposal_number']}** - Generada el {existing_proposal['issued_date']}")
                        st.caption("Se creará una nueva versión basada en esta propuesta con los datos prellenados")
            else:
                st.warning("No hay propuestas anteriores disponibles")

        if source_id or existing_proposal:
            st.success(f"✅ Origen seleccionado: {source_id[:8]}...")
            st.divider()

            # =========================
            # Configuración de Propuesta
            # =========================
            st.subheader("2️⃣ Configuración de la Propuesta")

            # Sección: Datos del Emisor
            with st.expander("🏢 Datos del Emisor (Tu Empresa)", expanded=True):
                col1, col2 = st.columns(2)

                with col1:
                    issuer_company = st.text_input(
                        "Nombre de la Empresa *", 
                        value=existing_proposal.get('issuer_company') or 'Tu Empresa S.A. de C.V.' if existing_proposal else "Tu Empresa S.A. de C.V.", 
                        key="issuer_company"
                    )
                    issuer_contact = st.text_input(
                        "Nombre del Contacto", 
                        value=existing_proposal.get('issuer_contact_name') or '' if existing_proposal else "", 
                        key="issuer_contact"
                    )
                    issuer_title = st.text_input(
                        "Cargo", 
                        value=existing_proposal.get('issuer_contact_title') or '' if existing_proposal else "", 
                        key="issuer_title"
                    )

                with col2:
                    issuer_email = st.text_input(
                        "Email", 
                        value=existing_proposal.get('issuer_email') or '' if existing_proposal else "", 
                        key="issuer_email"
                    )
                    issuer_phone = st.text_input(
                        "Teléfono", 
                        value=existing_proposal.get('issuer_phone') or '' if existing_proposal else "", 
                        key="issuer_phone"
                    )

            # Sección: Datos del Receptor
            with st.expander("👤 Datos del Cliente (Receptor)", expanded=True):
                col1, col2 = st.columns(2)

                with col1:
                    recipient_company = st.text_input(
                        "Nombre de la Empresa *", 
                        value=existing_proposal.get('recipient_company') or '' if existing_proposal else "", 
                        key="recipient_company"
                    )
                    recipient_contact = st.text_input(
                        "Nombre del Contacto *", 
                        value=existing_proposal.get('recipient_contact_name') or '' if existing_proposal else "", 
                        key="recipient_contact"
                    )
                    recipient_title = st.text_input(
                        "Cargo", 
                        value=existing_proposal.get('recipient_contact_title') or '' if existing_proposal else "", 
                        key="recipient_title"
                    )

                with col2:
                    recipient_email = st.text_input(
                        "Email", 
                        value=existing_proposal.get('recipient_email', '') if existing_proposal else "", 
                        key="recipient_email"
                    )

            # Sección: Contexto
            with st.expander("🎯 Contexto y Personalización", expanded=True):
                col1, col2 = st.columns(2)

                with col1:
                    from formal_proposal_generator import CLIENT_TYPES, MARKET_SECTORS

                    # Determinar índices si hay propuesta existente
                    default_client_idx = 0
                    default_sector_idx = 0
                    if existing_proposal:
                        try:
                            if existing_proposal.get('client_type') in CLIENT_TYPES:
                                default_client_idx = CLIENT_TYPES.index(existing_proposal['client_type'])
                        except:
                            pass
                        try:
                            if existing_proposal.get('market_sector') in MARKET_SECTORS:
                                default_sector_idx = MARKET_SECTORS.index(existing_proposal['market_sector'])
                        except:
                            pass

                    client_type = st.selectbox(
                        "Tipo de Cliente",
                        options=CLIENT_TYPES,
                        index=default_client_idx,
                        key="client_type"
                    )

                    market_sector = st.selectbox(
                        "Sector de Mercado",
                        options=MARKET_SECTORS,
                        index=default_sector_idx,
                        key="market_sector"
                    )

                with col2:
                    # Inicializar subject en session_state si no existe
                    if "subject_value" not in st.session_state:
                        st.session_state.subject_value = existing_proposal.get('subject', '') if existing_proposal else ""

                    col_subj_label, col_subj_btn = st.columns([3, 2])
                    with col_subj_label:
                        st.markdown("**Asunto / Motivo**")
                    with col_subj_btn:
                        ai_enabled = st.session_state.get('openai_enabled', False)
                        gen_subject = st.button(
                            "✨ Sugerir con IA" if ai_enabled else "🔒 IA no disponible",
                            key="btn_gen_subject",
                            disabled=not ai_enabled,
                            help="Genera automáticamente una descripción del motivo basada en los productos cotizados" if ai_enabled else "Requiere API Key de OpenAI en la barra lateral"
                        )

                    if gen_subject and ai_enabled:
                        # Recopilar contexto: líneas, cliente, sector
                        lines_context = st.session_state.get('lines', [])
                        client_ctx = source_data[11] if source_data else st.session_state.get('saved_client_name', 'el cliente')
                        sector_ctx = st.session_state.get('market_sector', 'Tecnología')

                        skus_desc = "\n".join([
                            f"- {l.get('sku','')}: {l.get('description_final', l.get('description_original',''))}"
                            for l in lines_context[:15]
                        ]) if lines_context else "Servicios tecnológicos y productos de cómputo"

                        prompt = (
                            f"Eres un ejecutivo comercial experto. Redacta un motivo/asunto profesional y conciso (máximo 3 oraciones) "
                            f"para una propuesta comercial dirigida a '{client_ctx}' del sector '{sector_ctx}'. "
                            f"Los productos/servicios cotizados son:\n{skus_desc}\n\n"
                            f"El texto debe dar contexto al cliente de lo que se le va a ofrecer, ser directo y motivar la lectura. "
                            f"No uses comillas ni encabezados. Solo el texto del motivo."
                        )

                        try:
                            import openai
                            api_key = st.session_state.get('openai_api_key')
                            client_ai = openai.OpenAI(api_key=api_key)
                            with st.spinner("Generando motivo con IA..."):
                                response = client_ai.chat.completions.create(
                                    model="gpt-4o-mini",
                                    messages=[{"role": "user", "content": prompt}],
                                    max_tokens=200,
                                    temperature=0.7
                                )
                            st.session_state.subject_value = response.choices[0].message.content.strip()
                            st.session_state['subject'] = st.session_state.subject_value
                            st.rerun()
                        except Exception as e:
                            st.error(f"Error generando sugerencia: {e}")

                    subject = st.text_area(
                        "",
                        value=st.session_state.subject_value,
                        height=120,
                        placeholder="Describe el motivo o asunto de la propuesta...",
                        key="subject",
                        label_visibility="collapsed"
                    )
                    # Sincronizar edición manual con session_state
                    if subject != st.session_state.subject_value:
                        st.session_state.subject_value = subject

                # Descripción del Proyecto (ancho completo)
                st.divider()
                if "project_desc_value" not in st.session_state:
                    st.session_state.project_desc_value = existing_proposal.get('project_description', '') if existing_proposal else ""

                col_desc_label, col_desc_btn = st.columns([3, 2])
                with col_desc_label:
                    st.markdown("**Descripción del Proyecto**")
                    st.caption("Contexto detallado que verá el cliente en la propuesta")
                with col_desc_btn:
                    ai_enabled_desc = st.session_state.get('openai_enabled', False)
                    correct_desc = st.button(
                        "✨ Corregir redacción con IA" if ai_enabled_desc else "🔒 IA no disponible",
                        key="btn_correct_project_desc",
                        disabled=not ai_enabled_desc,
                        help="La IA mejora la redacción de tu texto manteniendo el contenido" if ai_enabled_desc else "Requiere API Key de OpenAI en la barra lateral"
                    )

                if correct_desc and ai_enabled_desc:
                    raw_text = st.session_state.project_desc_value
                    if raw_text and raw_text.strip():
                        correction_prompt = (
                            f"Eres un redactor comercial experto. El usuario escribió la siguiente descripción de proyecto para una propuesta comercial:\n\n"
                            f"{raw_text}\n\n"
                            f"Corrige la ortografía, mejora la redacción y el tono profesional, y hazlo más persuasivo. "
                            f"Mantén el significado original. No agregues información que no esté en el texto. "
                            f"No uses comillas ni encabezados. Solo devuelve el texto corregido."
                        )
                        try:
                            import openai as _openai
                            _client_ai = _openai.OpenAI(api_key=st.session_state.get('openai_api_key'))
                            with st.spinner("Corrigiendo redacción con IA..."):
                                _resp = _client_ai.chat.completions.create(
                                    model="gpt-4o-mini",
                                    messages=[{"role": "user", "content": correction_prompt}],
                                    max_tokens=500,
                                    temperature=0.4
                                )
                            st.session_state.project_desc_value = _resp.choices[0].message.content.strip()
                            st.session_state['project_description'] = st.session_state.project_desc_value
                            st.rerun()
                        except Exception as _e:
                            st.error(f"Error al corregir: {_e}")
                    else:
                        st.warning("Escribe primero la descripción del proyecto antes de corregir.")

                project_description = st.text_area(
                    "",
                    value=st.session_state.project_desc_value,
                    height=150,
                    placeholder="Ej: Este proyecto busca modernizar la infraestructura tecnológica de la empresa, incorporando soluciones de cómputo de alto rendimiento y servicios de soporte especializado para garantizar la continuidad operativa...",
                    key="project_description",
                    label_visibility="collapsed"
                )
                # Sincronizar: siempre actualizar project_desc_value con lo que haya en el widget
                st.session_state.project_desc_value = project_description

            # Sección: Logos
            with st.expander("🎨 Logos", expanded=False):
                st.markdown("**Logo del Emisor (Tu Empresa)**")

                col1, col2 = st.columns(2)

                with col1:
                    # Logos existentes
                    from database import get_logos
                    issuer_logos = get_logos('issuer')

                    if issuer_logos:
                        logo_options = ["Ninguno"] + [f"{logo['logo_name']} ({logo['company_name']})" for logo in issuer_logos]
                        selected_issuer_logo = st.selectbox(
                            "Seleccionar logo existente",
                            options=logo_options,
                            key="selected_issuer_logo"
                        )

                        if selected_issuer_logo != "Ninguno":
                            selected_idx = logo_options.index(selected_issuer_logo) - 1
                            st.session_state.issuer_logo_id = issuer_logos[selected_idx]['logo_id']
                    else:
                        st.info("No hay logos guardados")

                with col2:
                    # Upload nuevo logo
                    uploaded_issuer_logo = st.file_uploader(
                        "Subir nuevo logo",
                        type=['png', 'jpg', 'jpeg'],
                        key="upload_issuer_logo"
                    )

                    if uploaded_issuer_logo:
                        _ih = hash(uploaded_issuer_logo.getvalue())
                        if st.session_state.get('_last_issuer_upload_hash') != _ih:
                            try:
                                logo_data, logo_format = process_logo_upload(uploaded_issuer_logo)
                                logo_id = str(uuid.uuid4())
                                success, msg = save_logo(
                                    logo_id,
                                    uploaded_issuer_logo.name,
                                    'issuer',
                                    issuer_company,
                                    logo_data,
                                    logo_format
                                )
                                if success:
                                    st.session_state['_last_issuer_upload_hash'] = _ih
                                    st.session_state.issuer_logo_id = logo_id
                                    st.success(msg)
                                else:
                                    st.error(msg)
                            except Exception as e:
                                st.error(f"Error: {e}")

                st.divider()
                st.markdown("**Logo del Cliente (Opcional)**")

                col1, col2 = st.columns(2)

                with col1:
                    client_logos = get_logos('client')

                    if client_logos:
                        logo_options = ["Ninguno"] + [f"{logo['logo_name']} ({logo['company_name']})" for logo in client_logos]
                        selected_client_logo = st.selectbox(
                            "Seleccionar logo existente",
                            options=logo_options,
                            key="selected_client_logo"
                        )

                        if selected_client_logo != "Ninguno":
                            selected_idx = logo_options.index(selected_client_logo) - 1
                            st.session_state.client_logo_id = client_logos[selected_idx]['logo_id']
                    else:
                        st.info("No hay logos de clientes guardados")

                with col2:
                    uploaded_client_logo = st.file_uploader(
                        "Subir logo de cliente",
                        type=['png', 'jpg', 'jpeg'],
                        key="upload_client_logo"
                    )

                    if uploaded_client_logo:
                        _ch = hash(uploaded_client_logo.getvalue())
                        if st.session_state.get('_last_client_upload_hash') != _ch:
                            try:
                                logo_data, logo_format = process_logo_upload(uploaded_client_logo)
                                logo_id = str(uuid.uuid4())
                                success, msg = save_logo(
                                    logo_id,
                                    uploaded_client_logo.name,
                                    'client',
                                    recipient_company,
                                    logo_data,
                                    logo_format
                                )
                                if success:
                                    st.session_state['_last_client_upload_hash'] = _ch
                                    st.session_state.client_logo_id = logo_id
                                    st.success(msg)
                                else:
                                    st.error(msg)
                            except Exception as e:
                                st.error(f"Error: {e}")

            # Sección: Configuración de IVA y Moneda
            with st.expander("💰 Configuración de IVA, Moneda y Vigencia", expanded=True):
                col1, col2, col3 = st.columns(3)

                # Determinar valores por defecto de moneda
                default_currency = "MXN (Pesos Mexicanos)"
                if existing_proposal and existing_proposal.get('currency') == 'USD':
                    default_currency = "USD (Dólares)"

                with col1:
                    currency = st.selectbox(
                        "Moneda",
                        options=["MXN (Pesos Mexicanos)", "USD (Dólares)"],
                        index=0 if default_currency.startswith("MXN") else 1,
                        key="currency",
                        help="Moneda en la que se presenta la propuesta"
                    )
                    currency_code = "MXN" if currency.startswith("MXN") else "USD"
                    currency_symbol = "$" if currency_code == "MXN" else "US$"

                with col2:
                    iva_rate = st.number_input(
                        "Tasa de IVA (%)",
                        min_value=0.0,
                        max_value=100.0,
                        value=float(existing_proposal.get('iva_rate', 0.16) * 100) if existing_proposal else 16.0,
                        step=1.0,
                        help="Tasa de IVA a aplicar (México: 16%)",
                        key="iva_rate"
                    ) / 100

                with col3:
                    default_iva_mode = "Desglosado (se suma al total)"
                    if existing_proposal and existing_proposal.get('iva_included'):
                        default_iva_mode = "Integrado (ya incluido en precios)"

                    iva_included = st.radio(
                        "¿Cómo mostrar el IVA?",
                        options=["Desglosado (se suma al total)", "Integrado (ya incluido en precios)"],
                        index=0 if default_iva_mode.startswith("Desglosado") else 1,
                        key="iva_included"
                    )

                    iva_included_bool = iva_included.startswith("Integrado")

                st.divider()
                col_vig1, col_vig2 = st.columns([1, 3])
                with col_vig1:
                    default_vigencia = 30
                    if existing_proposal and existing_proposal.get('valid_until') and existing_proposal.get('issued_date'):
                        try:
                            from datetime import date
                            _issued = date.fromisoformat(str(existing_proposal['issued_date']))
                            _valid  = date.fromisoformat(str(existing_proposal['valid_until']))
                            default_vigencia = (_valid - _issued).days
                        except:
                            pass
                    valid_until_days = st.number_input(
                        "Vigencia (días)",
                        min_value=1,
                        max_value=365,
                        value=default_vigencia,
                        step=1,
                        help="Días de validez de la propuesta a partir de la fecha de emisión",
                        key="valid_until_days"
                    )
                with col_vig2:
                    from datetime import date, timedelta as _td
                    _today = date.today()
                    _expiry = _today + _td(days=int(valid_until_days))
                    st.info(f"📅 La propuesta vence el **{_expiry.strftime('%d/%m/%Y')}** ({int(valid_until_days)} días desde hoy)")

            # Sección: Términos y Condiciones
            with st.expander("📋 Términos y Condiciones", expanded=False):
                from formal_proposal_generator import DEFAULT_TERMS

                terms = st.text_area(
                    "Edita los términos y condiciones",
                    value=existing_proposal.get('terms_and_conditions', DEFAULT_TERMS) if existing_proposal else DEFAULT_TERMS,
                    height=300,
                    help="Personaliza los términos según tu negocio",
                    key="terms"
                )

            # Sección: Firma
            with st.expander("✍️ Firma", expanded=True):
                col1, col2 = st.columns(2)

                with col1:
                    signature_name = st.text_input(
                        "Nombre de quien firma",
                        value=existing_proposal.get('signature_name', '') if existing_proposal else "",
                        key="signature_name"
                    )

                with col2:
                    signature_title = st.text_input(
                        "Cargo/Posición",
                        value=existing_proposal.get('signature_title', 'Ejecutivo Comercial') if existing_proposal else "Ejecutivo Comercial",
                        key="signature_title"
                    )

            st.divider()

            # =========================
            # Vista Previa y Generación
            # =========================
            st.subheader("3️⃣ Generar Propuesta")

            # Botón de generación
            col1, col2, col3 = st.columns([2, 1, 1])

            with col1:
                generate_button = st.button(
                    "🎯 Generar Propuesta Formal",
                    type="primary",
                    width='stretch'
                )

            with col2:
                preview_intro = st.button(
                    "👁️ Vista Previa Intro",
                    width='stretch'
                )

            if preview_intro:
                from formal_proposal_generator import generate_intro_text

                # Validación básica para mostrar preview
                issuer_clean = (issuer_company or "").strip()
                recipient_comp_clean = (recipient_company or "").strip()
                recipient_cont_clean = (recipient_contact or "").strip()

                if not issuer_clean or not recipient_comp_clean or not recipient_cont_clean:
                    st.warning("⚠️ Completa los campos obligatorios (Empresa emisora, Empresa receptora, Contacto) para ver la vista previa")
                else:
                    with st.spinner("Generando vista previa..."):
                        intro_text = generate_intro_text(
                            recipient_company,
                            recipient_contact,
                            client_type,
                            market_sector,
                            issuer_company,
                            use_ai=st.session_state.get('openai_enabled', False),
                            openai_api_key=st.session_state.get('openai_api_key')
                        )

                        st.markdown("---")
                        st.markdown("### 📝 Vista Previa de Introducción")
                        st.info(intro_text)
                        st.markdown("---")

            if generate_button:
                # Debug: mostrar valores capturados
                with st.expander("🔍 Debug - Valores capturados", expanded=False):
                    st.write("**Valores raw:**")
                    st.write(f"issuer_company: '{issuer_company}' (tipo: {type(issuer_company)})")
                    st.write(f"recipient_company: '{recipient_company}' (tipo: {type(recipient_company)})")
                    st.write(f"recipient_contact: '{recipient_contact}' (tipo: {type(recipient_contact)})")

                # Validar campos requeridos - limpiar espacios primero
                issuer_company_clean = (issuer_company or "").strip()
                recipient_company_clean = (recipient_company or "").strip()
                recipient_contact_clean = (recipient_contact or "").strip()

                missing_fields = []
                if not issuer_company_clean:
                    missing_fields.append("Nombre de Empresa Emisora")
                if not recipient_company_clean:
                    missing_fields.append("Nombre de Empresa Receptora")
                if not recipient_contact_clean:
                    missing_fields.append("Nombre del Contacto Receptor")

                if missing_fields:
                    st.error(f"❌ Completa los siguientes campos obligatorios: {', '.join(missing_fields)}")
                else:
                    with st.spinner("🎨 Generando propuesta formal..."):
                        try:
                            from formal_proposal_generator import create_formal_proposal, REPORTLAB_AVAILABLE
                            
                            # Verificar disponibilidad de ReportLab
                            if not REPORTLAB_AVAILABLE:
                                st.error("❌ ReportLab no está disponible. Los PDFs no se pueden generar. Verifica que las dependencias estén instaladas.")
                                st.stop()

                            # Preparar datos
                            issuer_data = {
                                'company': issuer_company,
                                'contact_name': issuer_contact,
                                'contact_title': issuer_title,
                                'email': issuer_email,
                                'phone': issuer_phone
                            }

                            recipient_data = {
                                'company': recipient_company,
                                'contact_name': recipient_contact,
                                'contact_title': recipient_title,
                                'email': recipient_email
                            }

                            context_data = {
                                'client_type': client_type,
                                'market_sector': market_sector,
                                'subject': st.session_state.get('subject', subject or ''),
                                'project_description': st.session_state.get('project_desc_value') or st.session_state.get('project_description') or project_description or ''
                            }

                            logo_ids = {
                                'issuer': st.session_state.get('issuer_logo_id'),
                                'client': st.session_state.get('client_logo_id')
                            }

                            signature_data = {
                                'name': signature_name,
                                'title': signature_title
                            }

                            iva_config = {
                                'rate': iva_rate,
                                'included': iva_included_bool,
                                'currency': currency_code,
                                'currency_symbol': currency_symbol,
                                'valid_until_days': int(valid_until_days)
                            }

                            # Generar propuesta
                            success, proposal_doc_id, message = create_formal_proposal(
                                quote_id=source_id,
                                issuer_data=issuer_data,
                                recipient_data=recipient_data,
                                context_data=context_data,
                                logo_ids=logo_ids,
                                terms=terms,
                                signature_data=signature_data,
                                iva_config=iva_config,
                                created_by=_current_user['alias']
                            )

                            if success:
                                st.success(f"✅ {message}")
                                st.balloons()

                                # Obtener PDF
                                from database import get_formal_proposal
                                proposal = get_formal_proposal(proposal_doc_id)

                                if proposal and proposal.get('pdf_file_data'):
                                    # Convertir memoryview a bytes si es necesario
                                    pdf_data = proposal['pdf_file_data']
                                    if isinstance(pdf_data, memoryview):
                                        pdf_data = bytes(pdf_data)

                                    st.download_button(
                                        label="📥 Descargar PDF",
                                        data=pdf_data,
                                        file_name=f"{proposal['proposal_number']}.pdf",
                                        mime="application/pdf",
                                        width='stretch'
                                    )
                            else:
                                st.error(f"❌ {message}")

                        except Exception as e:
                            st.error(f"❌ Error generando propuesta: {e}")
                            import traceback
                            st.code(traceback.format_exc())

            # =========================
            # Historial de Propuestas
            # =========================
            st.divider()
            st.subheader("📚 Propuestas Generadas")

            from database import get_formal_proposals, get_formal_proposal, get_quote_lines_full, mark_proposal_as_delivered, get_all_users

            # Filtros
            col_filter1, col_filter2, col_filter3 = st.columns([1, 1, 2])
            with col_filter1:
                status_filter_option = st.selectbox(
                    "Filtrar por estado:",
                    options=["Todas", "Borrador", "Entregadas"],
                    index=0,
                    key="proposal_status_filter"
                )

            # Filtro por usuario (solo visible para admin)
            user_filter_alias = None
            if _is_admin:
                with col_filter2:
                    _users_list = get_all_users()
                    _user_opts = ["Todos los usuarios"] + [f"{u['full_name']} (@{u['alias']})" for u in _users_list]
                    _selected_user = st.selectbox("Filtrar por usuario:", options=_user_opts, index=0, key="proposal_user_filter")
                    if _selected_user != "Todos los usuarios":
                        _idx = _user_opts.index(_selected_user) - 1
                        user_filter_alias = _users_list[_idx]['alias']

            # Convertir a valor de BD
            status_filter_value = None
            if status_filter_option == "Borrador":
                status_filter_value = "draft"
            elif status_filter_option == "Entregadas":
                status_filter_value = "delivered"

            all_proposals = get_formal_proposals(
                status_filter=status_filter_value,
                created_by_filter=user_filter_alias if _is_admin else _current_user['alias']
            )

            if all_proposals:
                # Controles de paginación
                col1, col2, col3 = st.columns([2, 1, 1])
                
                with col1:
                    st.write(f"**Total: {len(all_proposals)} propuestas**")
                
                with col2:
                    items_per_page = st.selectbox(
                        "Mostrar por página:",
                        options=[10, 20, 50, len(all_proposals)],
                        format_func=lambda x: "Todas" if x == len(all_proposals) else str(x),
                        key="proposals_per_page"
                    )
                
                with col3:
                    # Calcular número de páginas
                    total_pages = (len(all_proposals) - 1) // items_per_page + 1
                    if 'proposals_page' not in st.session_state:
                        st.session_state.proposals_page = 1
                    
                    current_page = st.number_input(
                        f"Página (de {total_pages}):",
                        min_value=1,
                        max_value=total_pages,
                        value=st.session_state.proposals_page,
                        key="proposals_page_input"
                    )
                    st.session_state.proposals_page = current_page
                
                # Calcular índices de paginación
                start_idx = (current_page - 1) * items_per_page
                end_idx = min(start_idx + items_per_page, len(all_proposals))
                paginated_proposals = all_proposals[start_idx:end_idx]
                
                st.write(f"Mostrando {start_idx + 1} - {end_idx} de {len(all_proposals)}")
                st.divider()
                
                # Selector dropdown de propuesta
                proposal_options = {
                    f"{prop['proposal_number']} - {prop['recipient_company']} ({prop['issued_date']})": prop['proposal_doc_id']
                    for prop in paginated_proposals
                }
                
                selected_proposal_label = st.selectbox(
                    "Selecciona una propuesta:",
                    options=list(proposal_options.keys()),
                    key="selected_proposal_dropdown"
                )
                
                if selected_proposal_label:
                    selected_proposal_id = proposal_options[selected_proposal_label]
                    
                    # Obtener propuesta completa
                    proposal_full = get_formal_proposal(selected_proposal_id)
                    
                    if proposal_full:
                        # Mostrar detalles
                        st.markdown("---")
                        
                        # Estado con badge visual
                        is_delivered = proposal_full.get('delivery_hash') is not None
                        
                        if is_delivered:
                            st.success("✅ PROPUESTA ENTREGADA - Inmutable")
                            
                            # Información de entrega
                            col_d1, col_d2, col_d3, col_d4 = st.columns(4)
                            with col_d1:
                                st.write("**Consecutivo:**")
                                st.code(proposal_full.get('delivery_number', 'N/A'))
                            with col_d2:
                                st.write("**Fecha Entrega:**")
                                delivered_at = proposal_full.get('delivered_at', 'N/A')
                                if delivered_at != 'N/A':
                                    # Formatear fecha si es datetime
                                    try:
                                        from datetime import datetime
                                        if isinstance(delivered_at, str):
                                            dt = datetime.fromisoformat(delivered_at.replace('Z', '+00:00'))
                                            delivered_at = dt.strftime('%Y-%m-%d %H:%M')
                                    except:
                                        pass
                                st.code(delivered_at)
                            with col_d3:
                                st.write("**Entregada por:**")
                                st.code(proposal_full.get('delivered_by', 'N/A'))
                            with col_d4:
                                st.write("**Hash Verificación:**")
                                st.code(proposal_full.get('delivery_hash', 'N/A')[:8])
                            
                            st.divider()
                        else:
                            st.warning("⚠️ Borrador - Puede ser marcada como entregada")
                        
                        col1, col2, col3 = st.columns(3)
                        with col1:
                            st.write("**Fecha Emisión:**")
                            st.info(str(proposal_full['issued_date']))
                        with col2:
                            st.write("**Cliente:**")
                            st.info(str(proposal_full['recipient_company']))
                        with col3:
                            st.write("**Número:**")
                            st.info(str(proposal_full['proposal_number']))
                        
                        # Botones de acción
                        if is_delivered:
                            # Propuesta entregada: solo permitir regenerar PDF
                            st.markdown("---")
                            st.write("📄 **Opciones disponibles (propuesta inmutable):**")
                            col_btn1, col_btn2, col_btn3 = st.columns(3)
                        else:
                            # Propuesta borrador: permitir marcar como entregada + PDF
                            st.markdown("---")
                            st.write("⚙️ **Acciones disponibles:**")
                            col_btn1, col_btn2, col_btn3 = st.columns(3)
                        
                        # Intentar descargar PDF guardado
                        pdf_data_available = False
                        if proposal_full.get('pdf_file_data'):
                            pdf_data = proposal_full['pdf_file_data']
                            if isinstance(pdf_data, memoryview):
                                pdf_data = bytes(pdf_data)
                            if len(pdf_data) > 0:
                                pdf_data_available = True
                                with col_btn1:
                                    st.download_button(
                                        label="📥 Descargar PDF",
                                        data=pdf_data,
                                        file_name=f"{proposal_full['proposal_number']}.pdf",
                                        mime="application/pdf",
                                        key=f"download_{selected_proposal_id}",
                                        width='stretch'
                                    )
                        
                        # Botón para regenerar PDF (siempre disponible)
                        with col_btn2:
                            if st.button(
                                "🔄 Regenerar PDF",
                                key=f"regen_{selected_proposal_id}",
                                width='stretch',
                                help="Genera un nuevo PDF con los datos actuales (sin modificar la propuesta)"
                            ):
                                with st.spinner("Generando PDF..."):
                                    try:
                                        from formal_proposal_generator import generate_proposal_pdf, REPORTLAB_AVAILABLE
                                        if not REPORTLAB_AVAILABLE:
                                            st.error("❌ ReportLab no está disponible")
                                        else:
                                            # Obtener líneas de cotización
                                            quote_id = proposal_full.get('quote_id')
                                            if quote_id:
                                                quote_lines_raw = get_quote_lines_full(quote_id)
                                                columns = ["line_id", "quote_id", "sku", "quantity", "description_original", "description_final",
                                                          "description_corrections", "line_type", "service_origin", "cost_unit",
                                                          "final_price_unit", "margin_pct", "strategy", "warnings", "created_at",
                                                          "import_source", "import_batch_id"]
                                                quote_lines = []
                                                for row in quote_lines_raw:
                                                    line_dict = dict(zip(columns, row))
                                                    if not line_dict.get('quantity') or line_dict['quantity'] <= 0:
                                                        line_dict['quantity'] = 1
                                                    quote_lines.append(line_dict)

                                                # Preparar datos de propuesta para PDF
                                                pdf_proposal_data = {
                                                    'proposal_number': proposal_full.get('proposal_number', ''),
                                                    'issued_date': proposal_full.get('issued_date', ''),
                                                    'valid_until': proposal_full.get('valid_until', ''),
                                                    'issuer_company': proposal_full.get('issuer_company', ''),
                                                    'issuer_contact_name': proposal_full.get('issuer_contact_name', ''),
                                                    'issuer_contact_title': proposal_full.get('issuer_contact_title', ''),
                                                    'issuer_email': proposal_full.get('issuer_email', ''),
                                                    'issuer_phone': proposal_full.get('issuer_phone', ''),
                                                    'recipient_company': proposal_full.get('recipient_company', ''),
                                                    'recipient_contact_name': proposal_full.get('recipient_contact_name', ''),
                                                    'recipient_contact_title': proposal_full.get('recipient_contact_title', ''),
                                                    'recipient_email': proposal_full.get('recipient_email', ''),
                                                    'subject': proposal_full.get('subject', ''),
                                                    'custom_intro': proposal_full.get('custom_intro', ''),
                                                    'terms_and_conditions': proposal_full.get('terms_and_conditions', ''),
                                                    'signature_name': proposal_full.get('signature_name', ''),
                                                    'signature_title': proposal_full.get('signature_title', ''),
                                                    'issuer_logo_id': proposal_full.get('issuer_logo_id'),
                                                    'client_logo_id': proposal_full.get('client_logo_id'),
                                                    'iva_rate': proposal_full.get('iva_rate', 0.16),
                                                    'iva_included': proposal_full.get('iva_included', False),
                                                    'currency': proposal_full.get('currency', 'MXN'),
                                                    'currency_symbol': proposal_full.get('currency_symbol', '$'),
                                                }

                                                success, new_pdf_data, error = generate_proposal_pdf(pdf_proposal_data, quote_lines)

                                                if success and new_pdf_data:
                                                    st.success(f"✅ PDF regenerado ({len(new_pdf_data)} bytes)")
                                                    st.download_button(
                                                        label="📥 Descargar PDF Regenerado",
                                                        data=new_pdf_data,
                                                        file_name=f"{proposal_full['proposal_number']}.pdf",
                                                        mime="application/pdf",
                                                        key=f"regen_download_{selected_proposal_id}_new"
                                                    )
                                                else:
                                                    st.error(f"❌ Error generando PDF: {error}")
                                            else:
                                                st.error("❌ No se encontró la cotización asociada a esta propuesta")
                                    except Exception as e:
                                        st.error(f"❌ Error: {e}")
                                        import traceback
                                        st.code(traceback.format_exc())
                        
                        # Botón para marcar como entregada (solo si es draft)
                        if not is_delivered:
                            with col_btn3:
                                if st.button(
                                    "✅ Marcar como Entregada",
                                    key=f"deliver_{selected_proposal_id}",
                                    width='stretch',
                                    type="primary",
                                    help="Marca la propuesta como entregada (inmutable)"
                                ):
                                    # Confirmar con el usuario
                                    if 'confirm_delivery' not in st.session_state:
                                        st.session_state.confirm_delivery = selected_proposal_id
                                        st.warning("⚠️ **¿Estás seguro?** Esta acción es irreversible. La propuesta se marcará como entregada y será inmutable.")
                                        
                            # Confirmar entrega
                            if st.session_state.get('confirm_delivery') == selected_proposal_id:
                                col_confirm1, col_confirm2 = st.columns(2)
                                with col_confirm1:
                                    if st.button("✅ Sí, marcar como entregada", key=f"confirm_yes_{selected_proposal_id}"):
                                        # Obtener usuario actual (puedes usar st.session_state si tienes login)
                                        current_user = st.session_state.get('user_name', 'system')
                                        
                                        success, message = mark_proposal_as_delivered(selected_proposal_id, current_user)
                                        if success:
                                            st.success(message)
                                            del st.session_state.confirm_delivery
                                            st.rerun()
                                        else:
                                            st.error(message)
                                
                                with col_confirm2:
                                    if st.button("❌ Cancelar", key=f"confirm_no_{selected_proposal_id}"):
                                        del st.session_state.confirm_delivery
                                        st.rerun()
            else:
                st.info("No hay propuestas formales generadas aún")

    # =========================
    # TAB: BASE DE DATOS
    # =========================

    # =========================
    # TAB: MOTOR AUP (OCULTO - código preservado)
    # =========================
    if False:  # Motor AUP deshabilitado - código preservado
      with tab_aup:
        st.header("🧠 Motor AUP (Multitenant)")
        st.divider()

        if "aup_context" not in st.session_state:
            st.session_state.aup_context = {
                "tenant_id": "default-tenant",
                "user_id": "default-user",
                "tenant_is_active": True,
                "user_has_permission": True,
            }

        if "aup_proposal_id" not in st.session_state:
            st.session_state.aup_proposal_id = None

        if "aup_derived_id" not in st.session_state:
            st.session_state.aup_derived_id = None

        # Nota informativa sobre multitenancy
        st.info("ℹ️ **Nota:** El sistema multitenancy está desactivado. Los campos tenant_id y user_id son opcionales con valores por defecto.")

        col_ctx1, col_ctx2, col_ctx3, col_ctx4 = st.columns([2, 2, 1, 1])
        with col_ctx1:
            st.session_state.aup_context["tenant_id"] = st.text_input(
                "tenant_id (opcional)",
                value=st.session_state.aup_context.get("tenant_id", "default-tenant"),
                placeholder="default-tenant",
                help="Sistema multitenancy no activo"
            )
        with col_ctx2:
            st.session_state.aup_context["user_id"] = st.text_input(
                "user_id (opcional)",
                value=st.session_state.aup_context.get("user_id", "default-user"),
                placeholder="default-user",
                help="Sistema multitenancy no activo"
            )
        with col_ctx3:
            st.session_state.aup_context["tenant_is_active"] = st.checkbox(
                "tenant activo",
                value=st.session_state.aup_context.get("tenant_is_active", True),
                disabled=True,
                help="Siempre activo (multitenancy desactivado)"
            )
        with col_ctx4:
            st.session_state.aup_context["user_has_permission"] = st.checkbox(
                "permiso",
                value=st.session_state.aup_context.get("user_has_permission", True),
                disabled=True,
                help="Siempre con permiso (multitenancy desactivado)"
            )

        context = st.session_state.aup_context

        col_create, col_status = st.columns([1, 3])
        with col_create:
            if st.button("Crear propuesta AUP", type="primary"):
                try:
                    st.session_state.aup_proposal_id = create_proposal("manual", context)
                    st.session_state.aup_derived_id = None
                    st.success("✅ Propuesta creada")
                except Exception as exc:
                    st.error(f"❌ {exc}")

        with col_status:
            if st.session_state.aup_proposal_id:
                proposal = aup_get_proposal(st.session_state.aup_proposal_id, context.get("tenant_id"))
                if proposal:
                    st.caption(
                        f"Propuesta: {proposal['proposal_id']} | Estado: {proposal['status']} | Origen: {proposal.get('origin')}"
                    )

        if st.session_state.aup_proposal_id:
            proposal_id = st.session_state.aup_proposal_id
            tenant_id = context.get("tenant_id")

            st.subheader("📥 Importar Excel")
            excel_file = st.file_uploader("Archivo Excel", type=["xlsx", "xls"], key="aup_excel")
            if st.button("Importar Excel a propuesta"):
                if excel_file is None:
                    st.warning("Selecciona un archivo")
                else:
                    try:
                        result = import_excel(proposal_id, excel_file.read(), context)
                        if result.get("success"):
                            st.success(f"✅ Filas importadas: {result.get('imported')}")
                        else:
                            st.error(f"❌ Errores: {result.get('errors')}")
                    except Exception as exc:
                        st.error(f"❌ {exc}")

            st.subheader("➕ Agregar item manual")
            with st.form("add_item_form", clear_on_submit=True):
                col1, col2 = st.columns(2)
                with col1:
                    new_quantity = st.number_input("Cantidad", min_value=0.01, value=1.0, step=0.01)
                    new_cost_unit = st.number_input("Costo unitario", min_value=0.0, value=0.0, step=0.01)
                with col2:
                    new_sku = st.text_input("SKU (opcional)")
                    new_component_type = st.text_input("Tipo/Origen (opcional)", help="Ej: Interno, Externo, Proveedor A")

                new_description = st.text_area("Descripción", placeholder="Descripción del item...")

                submitted_add = st.form_submit_button("➕ Agregar item", type="primary")

                if submitted_add:
                    if not new_description or not new_description.strip():
                        st.error("❌ La descripción es obligatoria")
                    else:
                        try:
                            result = add_proposal_item(
                                proposal_id,
                                new_quantity,
                                new_description,
                                new_cost_unit,
                                sku=new_sku if new_sku else None,
                                component_type=new_component_type if new_component_type else None,
                                context=context
                            )
                            st.success(f"✅ Item #{result['item_number']} agregado")
                            st.rerun()
                        except Exception as exc:
                            st.error(f"❌ {exc}")

            st.subheader("📦 Items de propuesta")
            items = aup_get_items(proposal_id, tenant_id)
            if items:
                # Verificar que los items tengan las columnas necesarias
                if items and isinstance(items, list) and len(items) > 0:
                    st.dataframe(pd.DataFrame(items), width="stretch")
                else:
                    st.info("No hay items todavía")

                st.markdown("**Editar item (controlado)**")
                options = {f"#{i['item_number']} · {i.get('description','')}": i for i in items}
                selected_label = st.selectbox("Selecciona item", list(options.keys()))
                selected_item = options[selected_label]

                with st.form("aup_edit_item"):
                    quantity = st.number_input("Cantidad", min_value=0.01, value=float(selected_item.get("quantity") or 1))
                    description = st.text_input("Descripción", value=selected_item.get("description") or "")
                    price_unit = st.number_input(
                        "Precio unitario (opcional)",
                        min_value=0.0,
                        value=float(selected_item.get("price_unit") or 0.0),
                    )
                    component_type = st.text_input(
                        "Tipo/Origen del servicio", 
                        value=selected_item.get("component_type") or "",
                        help="Ej: Interno, Externo, Proveedor A"
                    )
                    submitted = st.form_submit_button("Actualizar item")

                if submitted:
                    try:
                        update_proposal_item(
                            selected_item["item_id"],
                            {
                                "quantity": quantity,
                                "description": description,
                                "price_unit": price_unit if price_unit > 0 else None,
                                "component_type": component_type or None,
                            },
                            context,
                        )
                        st.success("✅ Item actualizado")
                    except Exception as exc:
                        st.error(f"❌ {exc}")

            else:
                st.info("No hay items todavía")

            st.subheader("🧮 Nodo integrado (única verdad)")
            integrated = aup_get_integrated_node(proposal_id, tenant_id)
            if integrated:
                col_i1, col_i2, col_i3, col_i4, col_i5 = st.columns(5)
                col_i1.metric("Costo total", f"${float(integrated.get('total_cost') or 0):,.2f}")
                col_i2.metric("Precio total", f"${float(integrated.get('total_price') or 0):,.2f}")
                col_i3.metric("Utilidad bruta", f"${float(integrated.get('gross_profit') or 0):,.2f}")
                margin_pct = integrated.get("margin_pct")
                col_i4.metric("Margen", f"{(float(margin_pct) * 100):.2f}%" if margin_pct is not None else "N/A")
                col_i5.metric("Health", str(integrated.get("health")))
            else:
                st.caption("Nodo integrado no disponible")

            st.subheader("🔒 Cierre formal")

            # Verificar si hay items antes de permitir cerrar
            items_count = len(items) if items else 0
            can_close = items_count > 0

            if not can_close:
                st.warning("⚠️ No puedes cerrar una propuesta vacía. Importa un Excel o agrega items primero.")

            if st.button("Cerrar propuesta AUP", disabled=not can_close):
                try:
                    result = close_proposal(proposal_id, context)
                    st.success(f"✅ Propuesta cerrada. Hash: {result.get('hash')}")
                except Exception as exc:
                    st.error(f"❌ {exc}")

            proposal = aup_get_proposal(proposal_id, tenant_id)
            if proposal and proposal.get("status") == "closed":
                st.subheader("🧬 Derivar nueva propuesta")
                if st.button("Derivar propuesta"):
                    try:
                        st.session_state.aup_derived_id = derive_proposal(proposal_id, context)
                        st.success(f"✅ Derivada: {st.session_state.aup_derived_id}")
                    except Exception as exc:
                        st.error(f"❌ {exc}")

                st.subheader("💰 Gastos asociados (post-cotización)")
                with st.form("aup_add_expense"):
                    category = st.selectbox(
                        "Categoría",
                        ["logistica", "seguros", "fianzas", "administrativos", "contingencias", "financieros"],
                    )
                    description = st.text_input("Descripción del gasto")
                    amount = st.number_input("Monto", min_value=0.0, value=0.0)
                    add_expense = st.form_submit_button("Agregar gasto")

                if add_expense:
                    try:
                        add_project_expense(
                            proposal_id,
                            {"category": category, "description": description, "amount": amount},
                            context,
                        )
                        st.success("✅ Gasto agregado")
                    except Exception as exc:
                        st.error(f"❌ {exc}")

                expenses = aup_get_expenses(proposal_id, tenant_id)
                if expenses:
                    st.dataframe(pd.DataFrame(expenses), width="stretch")

                st.subheader("📈 Nodo de rentabilidad")
                profitability = aup_get_profitability_node(proposal_id, tenant_id)
                if profitability:
                    col_p1, col_p2, col_p3, col_p4, col_p5 = st.columns(5)
                    col_p1.metric("Ventas", f"${float(profitability.get('total_sales') or 0):,.2f}")
                    col_p2.metric("Costos", f"${float(profitability.get('total_cost') or 0):,.2f}")
                    col_p3.metric("Gastos", f"${float(profitability.get('total_expenses') or 0):,.2f}")
                    net_margin = profitability.get("net_margin_pct")
                    col_p4.metric("Margen neto", f"{(float(net_margin) * 100):.2f}%" if net_margin is not None else "N/A")
                    col_p5.metric("Health", str(profitability.get("health")))

            if st.session_state.aup_derived_id:
                st.subheader("🔍 Comparación entre propuestas")
                try:
                    comparison = compare_proposals(proposal_id, st.session_state.aup_derived_id, context)
                    col_c1, col_c2 = st.columns(2)
                    col_c1.metric("Δ Precio", f"${float(comparison.get('delta_price') or 0):,.2f}")
                    col_c2.metric("Δ Margen", f"{float(comparison.get('delta_margin') or 0) * 100:.2f}%")
                    st.dataframe(pd.DataFrame(comparison.get("drilldown", [])), width="stretch")
                except Exception as exc:
                    st.error(f"❌ {exc}")

            st.subheader("📊 Visualizaciones (solo lectura)")
            try:
                charts = generate_charts_data(proposal_id, context)
                col_g1, col_g2, col_g3 = st.columns(3)

                with col_g1:
                    st.markdown("**Aportación por Origen de Servicio**")
                    comp_data = charts.get("pie_component_contribution", {})
                    if comp_data:
                        fig, ax = plt.subplots(figsize=(4, 4))
                        ax.pie(comp_data.values(), labels=comp_data.keys(), autopct="%1.1f%%")
                        st.pyplot(fig)
                        plt.close(fig)
                    else:
                        st.caption("Sin datos")

                with col_g2:
                    st.markdown("**Costo vs Utilidad Bruta**")
                    cvp = charts.get("pie_cost_vs_profit", {})
                    fig, ax = plt.subplots(figsize=(4, 4))
                    ax.pie([cvp.get("total_cost", 0), cvp.get("gross_profit", 0)], labels=["Costo", "Utilidad"])
                    st.pyplot(fig)
                    plt.close(fig)

                with col_g3:
                    st.markdown("**Distribución neta**")
                    net = charts.get("pie_net_distribution", {})
                    fig, ax = plt.subplots(figsize=(4, 4))
                    ax.pie(
                        [net.get("total_cost", 0), net.get("total_expenses", 0), net.get("net_profit", 0)],
                        labels=["Costo", "Gastos", "Utilidad Neta"],
                    )
                    st.pyplot(fig)
                    plt.close(fig)
            except Exception as exc:
                st.caption(f"Visualizaciones no disponibles: {exc}")
        else:
            st.info("Crea una propuesta para comenzar")

    # =========================
    # TAB: COMPARADOR
# =========================
with tab_comparator:
    st.header("⚖️ Comparador de Cotizaciones")
    st.divider()
    
    st.info("💡 Selecciona DOS cotizaciones cualesquiera para compararlas (pueden ser versiones distintas, clientes diferentes, etc.)")
    
    # Dos columnas para seleccionar las cotizaciones
    col_q1, col_q2 = st.columns(2)
    
    with col_q1:
        st.markdown("### 📄 Primera Cotización")
        quote_1_id = render_quote_search_selector(
            key="comparador_q1",
            label="Buscar cotización base",
            show_recent=True
        )
    
    with col_q2:
        st.markdown("### 📄 Segunda Cotización")
        quote_2_id = render_quote_search_selector(
            key="comparador_q2",
            label="Buscar cotización a comparar",
            show_recent=True
        )
    
    st.divider()
    
    # Botón para comparar
    if quote_1_id and quote_2_id:
        col_btn1, col_btn2, col_btn3 = st.columns([2, 1, 2])
        with col_btn2:
            if st.button("🔄 Comparar Ambas", type="primary", width='stretch'):
                if quote_1_id == quote_2_id:
                    st.warning("⚠️ Selecciona dos cotizaciones diferentes")
                else:
                    st.session_state.compare_quotes = {
                        "q1_id": quote_1_id,
                        "q2_id": quote_2_id
                    }
                    st.rerun()
    
    # Motor de comparación
    if "compare_quotes" in st.session_state:
        q1_group_id = st.session_state.compare_quotes["q1_id"]
        q2_group_id = st.session_state.compare_quotes["q2_id"]
        
        # Obtener datos de grupo para sacar el quote_id
        from database import get_quote_by_group_id, get_quote_by_id
        
        q1_group = get_quote_by_group_id(q1_group_id)
        q2_group = get_quote_by_group_id(q2_group_id)
        
        if not q1_group or not q2_group:
            st.error("❌ No se pudieron cargar las cotizaciones seleccionadas")
        else:
            # Obtener datos completos usando quote_id
            q1_data = get_quote_by_id(q1_group["quote_id"])
            q2_data = get_quote_by_id(q2_group["quote_id"])
        
            if not q1_data or not q2_data:
                st.error("❌ No se pudieron cargar los detalles de las cotizaciones")
            else:
                st.success(f"✅ Comparando: **{q1_data.get('proposal_name', 'Sin nombre')}** vs **{q2_data.get('proposal_name', 'Sin nombre')}**")
                st.divider()
            
                # ===== SELECTOR DE PLAYBOOK =====
                st.markdown("### 📘 Playbook / Contexto de Industria")
            
                col_playbook, col_playbook_desc = st.columns([1, 2])
            
                with col_playbook:
                    selected_playbook = st.selectbox(
                        "Selecciona playbook",
                        list(PLAYBOOKS.keys()),
                        key="comparador_playbook",
                        help="El playbook ajusta umbrales de salud y pesos de decisión según el contexto de negocio"
                    )
            
                with col_playbook_desc:
                    pb_desc = PLAYBOOKS[selected_playbook]["description"]
                    pb_green = PLAYBOOKS[selected_playbook]["green"]
                    pb_yellow = PLAYBOOKS[selected_playbook]["yellow"]
                    st.info(f"**{selected_playbook}:** {pb_desc}  \n📊 Verde ≥{pb_green}% | Amarillo ≥{pb_yellow}%")
            
                st.divider()
            
                # Convertir a formato similar al de versiones
                q1 = pd.Series({
                    "quote_id": q1_data.get("quote_id"),
                    "quote_group_id": q1_data.get("quote_group_id", ""),
                    "version": q1_data.get("version", 1),
                    "total_revenue": q1_data.get("total_revenue", 0),
                    "total_cost": q1_data.get("total_cost", 0),
                    "gross_profit": q1_data.get("gross_profit", 0),
                    "avg_margin": q1_data.get("avg_margin", 0),
                    "client_name": q1_data.get("client_name", ""),
                    "proposal_name": q1_data.get("proposal_name", ""),
                    "quoted_by": q1_data.get("quoted_by", ""),
                    "created_at": q1_data.get("created_at", "")
                })
            
                q2 = pd.Series({
                    "quote_id": q2_data.get("quote_id"),
                    "quote_group_id": q2_data.get("quote_group_id", ""),
                    "version": q2_data.get("version", 1),
                    "total_revenue": q2_data.get("total_revenue", 0),
                    "total_cost": q2_data.get("total_cost", 0),
                    "gross_profit": q2_data.get("gross_profit", 0),
                    "avg_margin": q2_data.get("avg_margin", 0),
                    "client_name": q2_data.get("client_name", ""),
                    "proposal_name": q2_data.get("proposal_name", ""),
                    "quoted_by": q2_data.get("quoted_by", ""),
                    "created_at": q2_data.get("created_at", "")
                })
            
                # ===== NIVEL A: Resumen Ejecutivo =====
                st.markdown("### 📈 Resumen Ejecutivo")
            
                col_info1, col_info2 = st.columns(2)
            
                with col_info1:
                    st.markdown(f"**Cotización 1:**")
                    st.caption(f"Cliente: {q1['client_name'] or 'Sin especificar'}")
                    st.caption(f"Propuesta: {q1['proposal_name'] or 'Sin nombre'}")
                    st.caption(f"Cotizado por: {q1['quoted_by'] or 'Sin especificar'}")
                    st.caption(f"Versión: v{q1['version']}")
            
                with col_info2:
                    st.markdown(f"**Cotización 2:**")
                    st.caption(f"Cliente: {q2['client_name'] or 'Sin especificar'}")
                    st.caption(f"Propuesta: {q2['proposal_name'] or 'Sin nombre'}")
                    st.caption(f"Cotizado por: {q2['quoted_by'] or 'Sin especificar'}")
                    st.caption(f"Versión: v{q2['version']}")
            
                st.divider()
            
                col_metrics1, col_metrics2, col_metrics3, col_metrics4 = st.columns(4)
            
                with col_metrics1:
                    delta_revenue = float(q2["total_revenue"] - q1["total_revenue"])
                    st.metric(
                        "Ingreso Total",
                        f"${float(q2['total_revenue']):,.2f}",
                        f"${delta_revenue:,.2f}",
                        delta_color="normal"
                    )
                    st.caption(f"Q1: ${float(q1['total_revenue']):,.2f}")
            
                with col_metrics2:
                    delta_profit = float(q2["gross_profit"] - q1["gross_profit"])
                    st.metric(
                        "Utilidad Bruta",
                        f"${float(q2['gross_profit']):,.2f}",
                        f"${delta_profit:,.2f}",
                        delta_color="normal"
                    )
                    st.caption(f"Q1: ${float(q1['gross_profit']):,.2f}")
            
                with col_metrics3:
                    delta_cost = float(q2["total_cost"] - q1["total_cost"])
                    st.metric(
                        "Costo Total",
                        f"${float(q2['total_cost']):,.2f}",
                        f"${delta_cost:,.2f}",
                        delta_color="inverse"
                    )
                    st.caption(f"Q1: ${float(q1['total_cost']):,.2f}")
            
                with col_metrics4:
                    delta_margin = float(q2["avg_margin"] - q1["avg_margin"])
                    st.metric(
                        "Margen Promedio",
                        f"{float(q2['avg_margin']):.2f}%",
                        f"{delta_margin:.2f}%",
                        delta_color="normal"
                    )
                    st.caption(f"Q1: {float(q1['avg_margin']):.2f}%")
            
                # ===== NIVEL B: Análisis por componente de origen =====
                st.divider()
                st.markdown("### 🔍 Análisis por Componente de Origen")
            
                l1_all = load_lines_for_quote(q1["quote_id"])
                l2_all = load_lines_for_quote(q2["quote_id"])
            
                # Usar directamente los DataFrames con las columnas correctas
                l1 = l1_all.copy()
                l2 = l2_all.copy()
            
                # Calcular totales por origen
                def calculate_origin_totals(df):
                    df = df.copy()
                    # Las columnas correctas son cost_unit y final_price_unit
                    df["cost_unit"] = pd.to_numeric(df["cost_unit"], errors="coerce").fillna(0.0)
                    df["final_price_unit"] = pd.to_numeric(df["final_price_unit"], errors="coerce").fillna(0.0)
                    # Usar cost_unit y final_price_unit directamente (sin multiplicar por quantity)
                    df["cost_total"] = df["cost_unit"]
                    df["revenue_total"] = df["final_price_unit"]
                
                    grouped = df.groupby("service_origin", as_index=False).agg({
                        "cost_total": "sum",
                        "revenue_total": "sum"
                    })
                    grouped.columns = ["Origen", "Costo", "Ingreso"]
                    grouped["Utilidad"] = grouped["Ingreso"] - grouped["Costo"]
                    return grouped
            
                comp_v1 = calculate_origin_totals(l1)
                comp_v2 = calculate_origin_totals(l2)
            
                # Merge para comparar
                comp_merged = pd.merge(
                    comp_v1,
                    comp_v2,
                    on="Origen",
                    how="outer",
                    suffixes=(" Q1", " Q2")
                ).fillna(0)
            
                comp_merged["Δ Absoluto"] = comp_merged["Ingreso Q2"] - comp_merged["Ingreso Q1"]
                comp_merged["Δ Relativo %"] = ((comp_merged["Ingreso Q2"] - comp_merged["Ingreso Q1"]) / comp_merged["Ingreso Q1"] * 100).replace([float('inf'), -float('inf')], 0).fillna(0)
            
                # Formatear para visualización
                comp_components = comp_merged.copy()
                for col in ["Costo Q1", "Ingreso Q1", "Utilidad Q1", "Costo Q2", "Ingreso Q2", "Utilidad Q2", "Δ Absoluto"]:
                    if col in comp_components.columns:
                        comp_components[col] = comp_components[col].apply(lambda x: f"${x:,.2f}")
            
                if "Δ Relativo %" in comp_components.columns:
                    comp_components["Δ Relativo %"] = comp_components["Δ Relativo %"].apply(lambda x: f"{x:.2f}%")
            
                st.dataframe(comp_components, width='stretch', hide_index=True)
            
                # ===== NIVEL C: Cambios de SKU =====
                st.divider()
                st.markdown("### 📦 Cambios en SKUs")
            
                skus_v1 = set(l1["sku"].tolist())
                skus_v2 = set(l2["sku"].tolist())
            
                skus_added = skus_v2 - skus_v1
                skus_removed = skus_v1 - skus_v2
                skus_common = skus_v1 & skus_v2
            
                col_sku1, col_sku2, col_sku3 = st.columns(3)
            
                with col_sku1:
                    st.metric("SKUs solo en Q2", len(skus_added))
                    if skus_added:
                        with st.expander("Ver SKUs"):
                            for sku in skus_added:
                                st.caption(f"✅ {sku}")
            
                with col_sku2:
                    st.metric("SKUs solo en Q1", len(skus_removed))
                    if skus_removed:
                        with st.expander("Ver SKUs"):
                            for sku in skus_removed:
                                st.caption(f"❌ {sku}")
            
                with col_sku3:
                    st.metric("SKUs en común", len(skus_common))
            
                # ===== NIVEL D: Sistema Narrativo Inteligente =====
                st.divider()
                st.markdown("### 📖 Narrativa Inteligente")
            
                narrative = generate_comparison_narrative(
                    q1=q1,
                    q2=q2,
                    df1=l1,
                    df2=l2,
                    playbook_name=selected_playbook
                )
            
                # Mostrar resumen ejecutivo
                st.markdown("#### 📌 Resumen Ejecutivo")
                st.success(narrative["executive"])
            
                # Mostrar detalle técnico
                if narrative["detail"]:
                    with st.expander("📋 Ver detalle técnico", expanded=False):
                        st.write(narrative["detail"])
            
                # Indicadores de salud
                col_health1, col_health2 = st.columns(2)
            
                with col_health1:
                    health_color = {"verde": "🟢", "amarillo": "🟡", "rojo": "🔴"}
                    st.caption(f"Salud Q1: {health_color[narrative['health_v1']]} {narrative['health_v1'].upper()}")
            
                with col_health2:
                    st.caption(f"Salud Q2: {health_color[narrative['health_v2']]} {narrative['health_v2'].upper()}")
            
                st.divider()
            
                # Insight automático
                st.markdown("### 💡 Insight Rápido")
            
                insights = []
            
                if delta_revenue > 0 and delta_margin > 0:
                    insights.append("✅ **Q2 superior:** Mayor ingreso Y mejor margen")
                elif delta_revenue > 0 and delta_margin < 0:
                    insights.append("⚠️ **Crecimiento agresivo en Q2:** Más ingreso pero sacrificó margen")
                elif delta_revenue < 0 and delta_margin > 0:
                    insights.append("🎯 **Q2 optimizada:** Menos ingreso pero margen mejoró")
                else:
                    insights.append("❌ **Q2 deteriorada:** Menos ingreso Y peor margen")
            
                if len(skus_added) > len(skus_removed):
                    insights.append(f"📈 **Q2 más amplia:** {len(skus_added)} SKUs nuevos vs {len(skus_removed)} eliminados")
                elif len(skus_removed) > len(skus_added):
                    insights.append(f"📉 **Q2 más simple:** {len(skus_removed)} SKUs eliminados vs {len(skus_added)} nuevos")
            
                # Origen que más cambió
                if not comp_components.empty and "Δ Absoluto" in comp_components.columns:
                    try:
                        # Necesitamos los valores numéricos originales, no los formateados
                        max_change_idx = comp_merged["Δ Absoluto"].abs().idxmax()
                        max_change_origen = comp_merged.loc[max_change_idx, "Origen"]
                        max_change_value = comp_merged.loc[max_change_idx, "Δ Absoluto"]
                        if abs(max_change_value) > 0:
                            insights.append(f"🎯 **Origen clave:** '{max_change_origen}' cambió ${abs(max_change_value):,.2f}")
                    except Exception:
                        pass
            
                for insight in insights:
                    st.markdown(insight)
    else:
        st.markdown("""
        <div style='text-align: center; padding: 3rem; background-color: rgba(128, 128, 128, 0.05); border-radius: 10px;'>
            <h3>📊 Listo para comparar</h3>
            <p>Selecciona dos cotizaciones arriba y presiona "🔄 Comparar Ambas"</p>
            <p style='font-size: 0.9em; color: #888;'>💡 Puedes comparar versiones del mismo cliente, propuestas de clientes diferentes, o cualquier combinación</p>
        </div>
        """, unsafe_allow_html=True)

# =========================
# TAB: PROPUESTAS FORMALES
# =========================
with tab_db:
    st.header("📚 Base de Datos de Propuestas")

    # Mostrar indicador si hay versión pendiente
    if st.session_state.get('lines') and len(st.session_state.lines) > 0:
        version_info = st.session_state.get('pending_version_info', '')
        if version_info:
            st.info(f"""
            📋 **Tienes {len(st.session_state.lines)} líneas cargadas** ({version_info})

            👉 **Ve al tab "📝 Cotizador Legacy"** para editar y guardar la nueva versión.
            """)

    st.divider()

    # Mostrar resumen de oportunidades - SOLO BAJO DEMANDA
    st.subheader("🗂️ Oportunidades y Versiones")
    
    st.info("💡 Selecciona cómo quieres ver las cotizaciones. No se carga nada automáticamente para mejor rendimiento.")
    
    # Opciones de visualización
    col_option1, col_option2 = st.columns(2)
    
    with col_option1:
        st.markdown("##### 🔍 Búsqueda Específica")
        search_term = st.text_input(
            "Buscar por nombre, cliente, cotizante...",
            placeholder="Ej: DIF, Juan, Protección de Cómputo",
            key="db_search"
        )
        
        col_search1, col_search2 = st.columns(2)
        with col_search1:
            search_limit = st.selectbox(
                "Máximo resultados:",
                options=[10, 20, 50, 100],
                index=1,
                key="db_search_limit"
            )
        with col_search2:
            do_search = st.button("🔍 Buscar", key="do_search_btn", type="primary", width='stretch')
    
    with col_option2:
        st.markdown("##### 📅 Ver Recientes")
        col_recent1, col_recent2 = st.columns(2)
        with col_recent1:
            recent_limit = st.selectbox(
                "Cantidad:",
                options=[5, 10, 20, 30, 50],
                index=1,
                key="db_recent_limit"
            )
        with col_recent2:
            show_recent = st.button("📋 Ver Recientes", key="show_recent_btn", width='stretch')
    
    # Determinar qué mostrar
    quotes_summary = None
    
    if do_search and search_term and search_term.strip():
        with st.spinner(f"Buscando '{search_term}'..."):
            quotes_summary = search_quotes(search_term, limit=search_limit)
            if quotes_summary:
                st.success(f"✅ Encontradas {len(quotes_summary)} cotizaciones")
            else:
                st.warning("No se encontraron cotizaciones con ese criterio")
    elif show_recent:
        with st.spinner(f"Cargando últimas {recent_limit} cotizaciones..."):
            quotes_summary = get_recent_quotes(limit=recent_limit)
            if quotes_summary:
                st.success(f"✅ Mostrando {len(quotes_summary)} cotizaciones recientes")
    
    st.divider()
    
    # Mostrar resultados solo si hay datos cargados
    if quotes_summary:
        # Convertir a DataFrame
        all_quotes_df = pd.DataFrame(
            quotes_summary,
            columns=["ID", "Group ID", "Versión", "Parent ID", "Fecha", "Estado", "Costo Total", "Ingreso Total", "Utilidad Bruta", "Margen Promedio %", "Playbook", "Cliente", "Cotizado por", "Nombre Propuesta"]
        )
        
        st.caption(f"📊 Mostrando {len(all_quotes_df)} cotizaciones")
        
        # Agrupar por Group ID para mostrar versiones por oportunidad
        for group_id in all_quotes_df["Group ID"].unique():
            # Para cada grupo, cargar todas sus versiones
            versions_df = load_versions_for_group(group_id)
            
            if versions_df.empty:
                continue
            
            # Renombrar columnas para consistencia
            group_df = versions_df.rename(columns={
                "quote_id": "ID",
                "quote_group_id": "Group ID",
                "version": "Versión",
                "parent_quote_id": "Parent ID",
                "created_at": "Fecha",
                "status": "Estado",
                "total_cost": "Costo Total",
                "total_revenue": "Ingreso Total",
                "gross_profit": "Utilidad Bruta",
                "avg_margin": "Margen Promedio %",
                "playbook_name": "Playbook",
                "client_name": "Cliente",
                "quoted_by": "Cotizado por",
                "proposal_name": "Nombre Propuesta"
            })
            
            proposal_name = group_df.iloc[0]["Nombre Propuesta"] if group_df.iloc[0]["Nombre Propuesta"] else "Sin nombre"
            client_name = group_df.iloc[0]["Cliente"] if group_df.iloc[0]["Cliente"] else "Sin cliente"
            
            with st.expander(f"📋 {proposal_name} - {client_name} ({len(group_df)} versiones)", expanded=False):
                # Crear diccionario de versiones para el selector
                version_options = {}
                for idx, row in group_df.iterrows():
                    version_num = int(row['Versión'])
                    fecha = pd.to_datetime(row['Fecha']).strftime("%Y-%m-%d %H:%M")
                    version_options[row['ID']] = f"v{version_num} - {fecha}"
                
                # Selector de versión
                col_select, col_page = st.columns([3, 1])
                
                with col_select:
                    selected_version_id = st.selectbox(
                        "Seleccionar versión",
                        options=list(version_options.keys()),
                        format_func=lambda x: version_options[x],
                        key=f"version_select_{group_id}"
                    )
                
                with col_page:
                    rows_per_page = st.selectbox(
                        "Líneas por página",
                        options=[10, 20, 50, 100],
                        index=0,
                        key=f"page_size_{group_id}"
                    )
                
                # Obtener datos de la versión seleccionada
                selected_row = group_df[group_df['ID'] == selected_version_id].iloc[0]
                
                # Mostrar KPIs de la versión seleccionada
                st.markdown("#### 📊 Resumen de KPIs")
                col1, col2, col3, col4, col5 = st.columns(5)
                
                with col1:
                    fecha = pd.to_datetime(selected_row['Fecha']).strftime("%Y-%m-%d %H:%M")
                    st.metric("Fecha", fecha[:10])
                    st.caption(fecha[11:])
                
                with col2:
                    st.metric("Ingreso Total", f"${selected_row['Ingreso Total']:,.2f}")
                
                with col3:
                    st.metric("Utilidad Bruta", f"${selected_row['Utilidad Bruta']:,.2f}")
                
                with col4:
                    st.metric("Margen", f"{selected_row['Margen Promedio %']:.2f}%")
                
                with col5:
                    st.metric("Costo Total", f"${selected_row['Costo Total']:,.2f}")
                
                st.divider()
                
                # Mostrar líneas de la versión seleccionada con paginado
                lines = get_quote_lines(selected_version_id)
                if lines:
                    lines_df = pd.DataFrame(
                        lines,
                        columns=["SKU", "Descripción", "Tipo", "Origen", "Costo Unit.", "Precio Unit.", "Margen %", "Estrategia", "Advertencias"]
                    )
                    
                    total_lines = len(lines_df)
                    st.caption(f"📋 Líneas de cotización: {total_lines} total")
                    
                    # Calcular paginación
                    total_pages = (total_lines - 1) // rows_per_page + 1
                    
                    if total_pages > 1:
                        page_number = st.selectbox(
                            "Página",
                            options=range(1, total_pages + 1),
                            key=f"page_num_{selected_version_id}"
                        )
                        
                        start_idx = (page_number - 1) * rows_per_page
                        end_idx = min(start_idx + rows_per_page, total_lines)
                        
                        st.caption(f"Mostrando líneas {start_idx + 1} a {end_idx} de {total_lines}")
                        paginated_df = lines_df.iloc[start_idx:end_idx]
                    else:
                        paginated_df = lines_df
                    
                    st.dataframe(paginated_df, hide_index=True, width='stretch')
                else:
                    st.info("No hay líneas para esta versión")
                
                st.divider()

        st.divider()

        # Vista consolidada (anterior)
        st.subheader("📊 Vista Consolidada")
        quotes_df = pd.DataFrame(
            quotes_summary,
            columns=["ID", "Group ID", "Versión", "Parent ID", "Fecha", "Estado", "Costo Total", "Ingreso Total", "Utilidad Bruta", "Margen Promedio %", "Playbook", "Cliente", "Cotizado por", "Nombre Propuesta"]
        )

        # Formatear fecha
        quotes_df["Fecha"] = pd.to_datetime(quotes_df["Fecha"]).dt.strftime("%Y-%m-%d %H:%M")

        # Formatear montos
        quotes_df["Costo Total"] = quotes_df["Costo Total"].apply(lambda x: f"${x:,.2f}")
        quotes_df["Ingreso Total"] = quotes_df["Ingreso Total"].apply(lambda x: f"${x:,.2f}")
        quotes_df["Utilidad Bruta"] = quotes_df["Utilidad Bruta"].apply(lambda x: f"${x:,.2f}")
        quotes_df["Margen Promedio %"] = quotes_df["Margen Promedio %"].apply(lambda x: f"{x:.2f}%")

        # Mostrar solo columnas relevantes
        display_df = quotes_df[["Nombre Propuesta", "Cliente", "Cotizado por", "Versión", "Fecha", "Ingreso Total", "Margen Promedio %", "Playbook"]].copy()

        st.dataframe(display_df, width='stretch', hide_index=True)

        # Selector de propuesta para ver detalle
        st.subheader("🔍 Ver detalle completo de propuesta")
        # Crear diccionario para mapear quote_id a información legible
        quote_options = {}
        for q in quotes_summary:
            quote_id = q[0]
            nombre = q[13] if q[13] else "Sin nombre"
            cliente = q[11] if q[11] else "Sin cliente"
            version = q[2]
            fecha = pd.to_datetime(q[4]).strftime("%Y-%m-%d")
            quote_options[quote_id] = f"{nombre} - {cliente} (v{version}) - {fecha}"

        selected_quote = st.selectbox(
            "Selecciona una propuesta",
            options=list(quote_options.keys()),
            format_func=lambda x: quote_options[x]
        )

        if selected_quote:
            # Obtener información completa de la cotización
            selected_quote_info = next((q for q in quotes_summary if q[0] == selected_quote), None)

            if selected_quote_info:
                st.divider()

                # === INFORMACIÓN GENERAL DE LA COTIZACIÓN ===
                st.markdown("### 📋 Información General")

                col_info1, col_info2, col_info3, col_info4, col_info5 = st.columns(5)

                with col_info1:
                    st.metric("Quote ID", f"{selected_quote_info[0][:12]}...")
                    st.caption(f"**Completo:** `{selected_quote_info[0]}`")

                with col_info2:
                    st.metric("Group ID", f"{selected_quote_info[1][:12]}...")
                    st.caption(f"**Completo:** `{selected_quote_info[1]}`")

                with col_info3:
                    st.metric("Versión", selected_quote_info[2])
                    parent_id = selected_quote_info[3] if selected_quote_info[3] else "Original"
                    st.caption(f"**Parent:** {parent_id[:12] if parent_id != 'Original' else 'Original'}...")

                with col_info4:
                    st.metric("Estado", selected_quote_info[5])
                    playbook = selected_quote_info[10] if len(selected_quote_info) > 10 else "General"
                    st.caption(f"**Playbook:** {playbook}")

                with col_info5:
                    fecha = pd.to_datetime(selected_quote_info[4]).strftime("%Y-%m-%d %H:%M:%S")
                    st.metric("Fecha Creación", fecha[:10])
                    st.caption(f"**Hora:** {fecha[11:]}")

                # === MÉTRICAS FINANCIERAS ===
                st.markdown("### 💰 Métricas Financieras")

                col_fin1, col_fin2, col_fin3, col_fin4 = st.columns(4)

                total_cost = float(selected_quote_info[6])
                total_revenue = float(selected_quote_info[7])
                gross_profit = float(selected_quote_info[8])
                avg_margin = float(selected_quote_info[9])

                col_fin1.metric("Costo Total", f"${total_cost:,.2f}")
                col_fin2.metric("Ingreso Total", f"${total_revenue:,.2f}")
                col_fin3.metric("Utilidad Bruta", f"${gross_profit:,.2f}")
                col_fin4.metric("Margen Promedio", f"{avg_margin:.2f}%")

            # Obtener TODAS las líneas con TODOS los campos
            lines_full = get_quote_lines_full(selected_quote)

            if lines_full:
                st.divider()
                st.markdown("### 📦 Líneas de la Cotización (Datos Completos)")

                # Crear DataFrame con TODOS los campos
                lines_complete_df = pd.DataFrame(
                    lines_full,
                    columns=[
                        "Line ID", "Quote ID", "SKU", "Cantidad",
                        "Descripción Original", "Descripción Final", "Correcciones",
                        "Tipo", "Origen", "Costo Unit.", "Precio Unit.",
                        "Margen %", "Estrategia", "Advertencias", "Fecha Creación",
                        "Fuente Importación", "Batch ID"
                    ]
                )

                # Convertir columnas numéricas a tipo numérico
                lines_complete_df["Cantidad"] = pd.to_numeric(lines_complete_df["Cantidad"], errors='coerce').fillna(1.0)
                lines_complete_df["Costo Unit."] = pd.to_numeric(lines_complete_df["Costo Unit."], errors='coerce').fillna(0.0)
                lines_complete_df["Precio Unit."] = pd.to_numeric(lines_complete_df["Precio Unit."], errors='coerce').fillna(0.0)
                lines_complete_df["Margen %"] = pd.to_numeric(lines_complete_df["Margen %"], errors='coerce').fillna(0.0)

                # Calcular subtotales
                lines_complete_df["Subtotal Costo"] = lines_complete_df["Costo Unit."] * lines_complete_df["Cantidad"]
                lines_complete_df["Subtotal Precio"] = lines_complete_df["Precio Unit."] * lines_complete_df["Cantidad"]

                # Formatear para mejor visualización
                display_lines_df = lines_complete_df.copy()
                display_lines_df["Line ID"] = display_lines_df["Line ID"].apply(lambda x: f"{x[:12]}...")
                display_lines_df["Quote ID"] = display_lines_df["Quote ID"].apply(lambda x: f"{x[:12]}...")
                display_lines_df["Costo Unit."] = display_lines_df["Costo Unit."].apply(lambda x: f"${x:,.2f}")
                display_lines_df["Precio Unit."] = display_lines_df["Precio Unit."].apply(lambda x: f"${x:,.2f}")
                display_lines_df["Subtotal Costo"] = display_lines_df["Subtotal Costo"].apply(lambda x: f"${x:,.2f}")
                display_lines_df["Subtotal Precio"] = display_lines_df["Subtotal Precio"].apply(lambda x: f"${x:,.2f}")
                display_lines_df["Margen %"] = display_lines_df["Margen %"].apply(lambda x: f"{x:.2f}%" if pd.notna(x) else "N/A")
                display_lines_df["Fecha Creación"] = pd.to_datetime(display_lines_df["Fecha Creación"]).dt.strftime("%Y-%m-%d %H:%M")

                # Mostrar tabla completa
                st.dataframe(
                    display_lines_df,
                    width='stretch',
                    hide_index=True,
                    height=400
                )

                # === ESTADÍSTICAS DETALLADAS ===
                st.markdown("### 📊 Estadísticas Detalladas")

                col_stat1, col_stat2, col_stat3, col_stat4, col_stat5 = st.columns(5)

                total_lines = len(lines_full)
                products = sum(1 for line in lines_full if line[7] == "product")
                services = sum(1 for line in lines_full if line[7] == "service")
                imported = sum(1 for line in lines_full if line[15] and line[15] != "manual")
                manual = total_lines - imported

                col_stat1.metric("Total de líneas", total_lines)
                col_stat2.metric("Productos", products)
                col_stat3.metric("Servicios", services)
                col_stat4.metric("Importadas", imported)
                col_stat5.metric("Manuales", manual)

                # === ANÁLISIS POR ORIGEN DE SERVICIO ===
                st.markdown("### 🔍 Análisis por Origen de Servicio")
                st.caption("El 'Origen de Servicio' es el campo 'service_origin' de cada línea (ej: Interno, Externo, Proveedor A, etc.)")

                # Agrupar por origen de servicio
                origen_analysis = {}
                for line in lines_full:
                    origen = line[8]  # service_origin
                    cantidad = float(line[3])
                    costo_unit = float(line[9])
                    precio_unit = float(line[10])

                    if origen not in origen_analysis:
                        origen_analysis[origen] = {
                            "cantidad": 0,
                            "costo_total": 0,
                            "precio_total": 0,
                            "lineas": 0
                        }

                    origen_analysis[origen]["cantidad"] += cantidad
                    origen_analysis[origen]["costo_total"] += costo_unit * cantidad
                    origen_analysis[origen]["precio_total"] += precio_unit * cantidad
                    origen_analysis[origen]["lineas"] += 1

                # Crear DataFrame de análisis
                origen_df_data = []
                for origen, stats in origen_analysis.items():
                    utilidad = stats["precio_total"] - stats["costo_total"]
                    margen = (utilidad / stats["precio_total"] * 100) if stats["precio_total"] > 0 else 0

                    origen_df_data.append({
                        "Origen/Tipo": origen,
                        "Líneas": stats["lineas"],
                        "Cantidad Total": stats["cantidad"],
                        "Costo Total": f"${stats['costo_total']:,.2f}",
                        "Ingreso Total": f"${stats['precio_total']:,.2f}",
                        "Utilidad": f"${utilidad:,.2f}",
                        "Margen %": f"{margen:.2f}%"
                    })

                origen_df = pd.DataFrame(origen_df_data)
                st.dataframe(origen_df, width='stretch', hide_index=True)

            else:
                st.warning("⚠️ No se encontraron líneas para esta cotización")
        else:
            st.info("No hay propuestas guardadas aún")
    else:
        # No hay datos cargados
        st.markdown("---")
        st.markdown("""
        <div style='text-align: center; padding: 2rem; background-color: rgba(128, 128, 128, 0.1); border-radius: 10px;'>
            <h3>📂 No hay datos cargados</h3>
            <p>Selecciona una opción arriba para buscar cotizaciones específicas o ver las más recientes</p>
            <p style='font-size: 0.9em; color: #888;'>💡 Esto mejora el rendimiento al no cargar toda la base automáticamente</p>
        </div>
        """, unsafe_allow_html=True)

        # =========================
        # EXPORTAR Y GESTIÓN DE BASE DE DATOS
        # =========================
        st.divider()
        st.subheader("🗂️ Gestión de Base de Datos")

        col1, col2 = st.columns(2)

        with col1:
            st.markdown("### 📥 Exportar Datos")
            st.info("💡 Descarga toda la información antes de borrar la base de datos")
            st.warning("⚠️ Esta operación carga TODA la base de datos. Puede ser lenta con muchos registros.")

            # Obtener todos los datos (este es el único caso donde necesitamos TODO)
            all_quotes = get_all_quotes()

            if all_quotes:
                # Preparar datos para exportación
                quotes_data = []
                for q in all_quotes:
                    quotes_data.append({
                        "ID": q[0],
                        "Grupo": q[1],
                        "Versión": q[2],
                        "Cotización Padre": q[3],
                        "Fecha Creación": q[4],
                        "Estado": q[5],
                        "Costo Total": q[6],
                        "Ingreso Total": q[7],
                        "Utilidad": q[8],
                        "Margen Promedio": q[9],
                        "Playbook": q[10],
                        "Cliente": q[11],
                        "Cotizado Por": q[12],
                        "Nombre Propuesta": q[13]
                    })

                quotes_df = pd.DataFrame(quotes_data)

                # Obtener líneas de cotización
                all_lines_data = []
                for q in all_quotes:
                    quote_id = q[0]
                    lines = get_quote_lines_full(quote_id)
                    if lines:
                        for line in lines:
                            # get_quote_lines_full devuelve: line_id, quote_id, sku, quantity, 
                            # description_original, description_final, description_corrections, 
                            # line_type, service_origin, cost_unit, final_price_unit, margin_pct, 
                            # strategy, warnings, created_at, import_source, import_batch_id
                            all_lines_data.append({
                                "ID Línea": line[0],
                                "ID Cotización": line[1],
                                "SKU": line[2],
                                "Cantidad": line[3],
                                "Descripción": line[4],
                                "Precio Unitario": line[10],
                                "Costo Unitario": line[9],
                                "Precio Total": line[3] * line[10] if line[3] and line[10] else 0,
                                "Costo Total": line[3] * line[9] if line[3] and line[9] else 0,
                                "Utilidad": (line[3] * line[10] - line[3] * line[9]) if line[3] and line[10] and line[9] else 0,
                                "Margen %": line[11],
                                "Origen": line[8],
                                "Playbook Matched": line[12],
                                "Comentarios": line[6],
                                "Salud": line[13],
                                "Fue Corregido": "Sí" if line[5] and line[5] != line[4] else "No",
                                "Texto Original": line[4],
                                "Origen Importación": line[15] if len(line) > 15 else None,
                                "Lote Importación": line[16] if len(line) > 16 else None
                            })

                lines_df = pd.DataFrame(all_lines_data) if all_lines_data else pd.DataFrame()

                # Resumen de la exportación
                st.metric("Total de Cotizaciones", len(quotes_df))
                st.metric("Total de Líneas", len(lines_df))

                # Botones de descarga
                st.markdown("#### Descargar archivos:")

                # CSV de cotizaciones
                csv_quotes = quotes_df.to_csv(index=False).encode('utf-8')
                st.download_button(
                    label="📄 Descargar Cotizaciones (CSV)",
                    data=csv_quotes,
                    file_name=f"cotizaciones_{pd.Timestamp.now().strftime('%Y%m%d_%H%M%S')}.csv",
                    mime="text/csv",
                    width='stretch'
                )

                # CSV de líneas
                if not lines_df.empty:
                    csv_lines = lines_df.to_csv(index=False).encode('utf-8')
                    st.download_button(
                        label="📋 Descargar Líneas de Cotización (CSV)",
                        data=csv_lines,
                        file_name=f"lineas_cotizacion_{pd.Timestamp.now().strftime('%Y%m%d_%H%M%S')}.csv",
                        mime="text/csv",
                        width='stretch'
                    )

                # Excel con ambas hojas
                try:
                    import io
                    output = io.BytesIO()
                    with pd.ExcelWriter(output, engine='openpyxl') as writer:
                        quotes_df.to_excel(writer, sheet_name='Cotizaciones', index=False)
                        if not lines_df.empty:
                            lines_df.to_excel(writer, sheet_name='Líneas', index=False)
                    excel_data = output.getvalue()

                    st.download_button(
                        label="📊 Descargar Todo (Excel)",
                        data=excel_data,
                        file_name=f"base_datos_completa_{pd.Timestamp.now().strftime('%Y%m%d_%H%M%S')}.xlsx",
                        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        width='stretch'
                    )
                except ImportError:
                    st.warning("⚠️ Instala 'openpyxl' para exportar a Excel")

            else:
                st.warning("⚠️ No hay datos para exportar")

        with col2:
            st.markdown("### 🗑️ Borrar Base de Datos")
            st.error("⚠️ **PRECAUCIÓN:** Esta acción es irreversible")

            if all_quotes:
                st.warning(f"Se borrarán **{len(all_quotes)} cotizaciones** y todas sus líneas asociadas")

                # Checkbox de confirmación
                confirmar_borrado = st.checkbox(
                    "✅ Confirmo que he descargado la información y quiero borrar TODA la base de datos",
                    key="confirmar_borrado_db"
                )

                if confirmar_borrado:
                    st.text_input(
                        "Escribe 'BORRAR TODO' para confirmar:",
                        key="texto_confirmacion_borrado"
                    )

                    if st.button("🗑️ BORRAR TODA LA BASE DE DATOS", type="primary", width='stretch'):
                        if st.session_state.get("texto_confirmacion_borrado", "") == "BORRAR TODO":
                            with st.spinner("Borrando base de datos..."):
                                conn = None
                                cursor = None
                                try:
                                    conn = get_connection()
                                    cursor = conn.cursor()

                                    # Contar registros antes de borrar
                                    deleted_counts = {}

                                    if is_postgres():
                                        # Obtener conteos antes de borrar
                                        tables = ["formal_proposals", "import_files", "quote_lines", "quotes"]
                                        for table in tables:
                                            try:
                                                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                                                deleted_counts[table] = cursor.fetchone()[0]
                                            except:
                                                deleted_counts[table] = 0

                                        # Usar DELETE en orden inverso de dependencias
                                        # formal_proposals depende de quotes, así que se borra primero
                                        cursor.execute("DELETE FROM formal_proposals")
                                        cursor.execute("DELETE FROM import_files")
                                        cursor.execute("DELETE FROM quote_lines")
                                        cursor.execute("DELETE FROM quotes")

                                        conn.commit()
                                    else:
                                        # SQLite - mismo enfoque
                                        tables = [
                                            ("formal_proposals", True),
                                            ("import_files", True),
                                            ("quote_lines", False),
                                            ("quotes", False)
                                        ]

                                        for table, optional in tables:
                                            try:
                                                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                                                deleted_counts[table] = cursor.fetchone()[0]
                                                cursor.execute(f"DELETE FROM {table}")
                                            except Exception:
                                                if not optional:
                                                    raise
                                                deleted_counts[table] = 0

                                        conn.commit()

                                    cursor.close()
                                    conn.close()

                                    st.cache_data.clear()

                                    mensaje = (
                                        "✅ Base de datos borrada exitosamente\n\n"
                                        f"- {deleted_counts.get('quotes', 0)} cotizaciones eliminadas\n"
                                        f"- {deleted_counts.get('quote_lines', 0)} líneas eliminadas"
                                    )
                                    if deleted_counts.get("formal_proposals", 0) > 0:
                                        mensaje += f"\n- {deleted_counts['formal_proposals']} propuestas formales eliminadas"
                                    if deleted_counts.get("import_files", 0) > 0:
                                        mensaje += f"\n- {deleted_counts['import_files']} archivos importados eliminados"

                                    st.success(mensaje)
                                    st.session_state.confirmar_borrado_db = False
                                    st.session_state.texto_confirmacion_borrado = ""
                                    st.rerun()

                                except Exception as e:
                                    if conn:
                                        try:
                                            conn.rollback()
                                        except:
                                            pass  # Conexión ya cerrada
                                        try:
                                            if cursor:
                                                cursor.close()
                                        except:
                                            pass
                                        try:
                                            conn.close()
                                        except:
                                            pass
                                    st.error(f"❌ Error al borrar la base de datos: {str(e)}")
                        else:
                            st.error("❌ Debes escribir 'BORRAR TODO' para confirmar")
                else:
                    st.info("👆 Marca la casilla arriba para habilitar el borrado")
            else:
                st.info("✅ La base de datos ya está vacía")

# =========================
# FOOTER
# =========================
st.divider()

# Panel de Administración de Usuarios (solo admin)
if _is_admin:
    with st.expander("👥 Administración de Usuarios", expanded=False):
        admin_tab1, admin_tab2 = st.tabs(["📋 Usuarios", "➕ Nuevo Usuario"])

        with admin_tab1:
            users = get_all_users()
            if users:
                for u in users:
                    col_info, col_role, col_status, col_pass = st.columns([3, 1.5, 1, 1.5])
                    with col_info:
                        st.markdown(f"**{u['full_name']}** · `@{u['alias']}`")
                        st.caption(f"ID: {u['user_id'][:8]}...  |  Creado: {str(u['created_at'])[:10]}")
                    with col_role:
                        st.markdown(f"{'👑 Admin' if u['role'] == 'admin' else '🧑 Usuario'}")
                    with col_status:
                        is_active = u['active']
                        label = "✅" if is_active else "🔴"
                        if st.button(label, key=f"toggle_{u['user_id']}", help="Activar/Desactivar"):
                            toggle_user_active(u['user_id'], not is_active)
                            st.rerun()
                    with col_pass:
                        if st.button("🔑 Reset", key=f"reset_{u['user_id']}", help="Cambiar contraseña"):
                            st.session_state[f"reset_target"] = u['user_id']
                            st.session_state[f"reset_alias"] = u['alias']
                    st.divider()

                # Modal reset contraseña
                if st.session_state.get('reset_target'):
                    target_id = st.session_state['reset_target']
                    target_alias = st.session_state.get('reset_alias', '')
                    st.warning(f"Cambiando contraseña de **@{target_alias}**")
                    with st.form("form_reset_pass"):
                        new_pass = st.text_input("Nueva contraseña", type="password")
                        new_pass2 = st.text_input("Confirmar contraseña", type="password")
                        col_ok, col_cancel = st.columns(2)
                        with col_ok:
                            if st.form_submit_button("Guardar", type="primary", use_container_width=True):
                                if not new_pass:
                                    st.error("Ingresa la nueva contraseña")
                                elif new_pass != new_pass2:
                                    st.error("Las contraseñas no coinciden")
                                else:
                                    ok, msg = update_user_password(target_id, new_pass)
                                    if ok:
                                        st.success(f"✅ Contraseña actualizada")
                                        st.session_state.pop('reset_target', None)
                                        st.session_state.pop('reset_alias', None)
                                        st.rerun()
                                    else:
                                        st.error(msg)
                        with col_cancel:
                            if st.form_submit_button("Cancelar", use_container_width=True):
                                st.session_state.pop('reset_target', None)
                                st.session_state.pop('reset_alias', None)
                                st.rerun()
            else:
                st.info("No hay usuarios registrados.")

        with admin_tab2:
            with st.form("form_new_user"):
                col1, col2 = st.columns(2)
                with col1:
                    nu_first = st.text_input("Nombre *")
                    nu_alias = st.text_input("Alias (usuario) *", placeholder="juan.perez")
                    nu_pass = st.text_input("Contraseña *", type="password")
                with col2:
                    nu_last = st.text_input("Apellido *")
                    nu_role = st.selectbox("Rol", options=["user", "admin"], format_func=lambda x: "👑 Admin" if x == "admin" else "🧑 Usuario")
                    nu_pass2 = st.text_input("Confirmar contraseña *", type="password")
                if st.form_submit_button("✅ Crear usuario", type="primary", use_container_width=True):
                    if not all([nu_alias, nu_first, nu_last, nu_pass]):
                        st.error("Completa todos los campos obligatorios (*)")
                    elif nu_pass != nu_pass2:
                        st.error("Las contraseñas no coinciden")
                    else:
                        ok, msg = create_user(nu_alias.strip(), nu_first.strip(), nu_last.strip(), nu_pass, role=nu_role)
                        if ok:
                            st.success(f"✅ {msg}")
                        else:
                            st.error(msg)

db_info = get_database_info()
st.caption(f"DynamiQuote © 2026 | {db_info['icon']} {db_info['type']} | Cotizador | State: Production-Ready")
