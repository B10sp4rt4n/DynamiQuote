import streamlit as st
import pandas as pd
import uuid
from datetime import datetime, UTC
import matplotlib.pyplot as plt
from spellchecker import SpellChecker
from database import init_database, save_quote, save_import_file, get_all_quotes, get_quote_lines, get_quote_lines_full, get_latest_version, load_versions_for_group, load_lines_for_quote, get_database_info
from excel_import import import_excel_file, format_validation_report
import os

# =========================
# Configuración
# =========================
st.set_page_config(page_title="Quote Intelligence MVP", layout="wide")

# =========================
# Sidebar - Configuración de OpenAI
# =========================
with st.sidebar:
    st.header("⚙️ Configuración")
    
    # OpenAI API Key
    st.subheader("🤖 Corrección Inteligente con IA")
    
    # Intentar cargar desde variable de entorno primero
    default_api_key = os.getenv("OPENAI_API_KEY", "")
    
    openai_api_key = st.text_input(
        "OpenAI API Key",
        value=default_api_key,
        type="password",
        help="Ingresa tu API key de OpenAI para habilitar corrección inteligente de texto. Obténla en: https://platform.openai.com/api-keys"
    )
    
    if openai_api_key and openai_api_key.startswith("sk-"):
        st.success("✅ OpenAI habilitado - Corrección inteligente activa")
        # Guardar en session state
        st.session_state.openai_enabled = True
        st.session_state.openai_api_key = openai_api_key
    else:
        st.warning("⚠️ OpenAI deshabilitado - Usando corrector básico")
        st.caption("Sin API key, se usará el corrector ortográfico básico.")
        st.session_state.openai_enabled = False
        st.session_state.openai_api_key = None
    
    st.divider()
    
    # Info de base de datos
    db_info = get_database_info()
    st.caption(f"💾 Base de datos: {db_info['type']}")
    if db_info['type'] == 'PostgreSQL':
        st.caption(f"🌐 Host: {db_info['host']}")

st.title("🧾 Cotizador Universal – MVP Funcional")

# =========================
# Spellchecker Básico
# =========================
spell = SpellChecker(language="es")

def suggest_description_fix_basic(text):
    """Corrector ortográfico básico usando PySpellChecker."""
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
    
    # --- Análisis por componente
    comp1 = df1.groupby("service_origin")["final_price_unit"].sum()
    comp2 = df2.groupby("service_origin")["final_price_unit"].sum()
    
    comp_delta = (comp2 - comp1).fillna(comp2).fillna(0)
    
    top_change = comp_delta.abs().sort_values(ascending=False)
    
    if not top_change.empty and top_change.iloc[0] != 0:
        main_component = top_change.index[0]
        value = comp_delta[main_component]
        
        direction = "incrementó" if value > 0 else "redujo"
        narrative_detail.append(
            f"El componente '{main_component}' {direction} su aportación en ${round(abs(value), 2):,.2f}."
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

# Mostrar info de base de datos
db_info = get_database_info()
st.sidebar.markdown(f"{db_info['icon']} **Base de datos:** {db_info['type']}")
st.sidebar.caption(f"Conexión: {db_info['connection']}")

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

# =========================
# Comparador de versiones
# =========================
st.divider()
st.header("🔍 Comparador de Versiones")

# Obtener histórico para selector
hist_compare = pd.DataFrame(
    get_all_quotes(),
    columns=["quote_id", "quote_group_id", "version", "parent_quote_id", "created_at", "status", "total_cost", "total_revenue", "gross_profit", "avg_margin"]
)

if not hist_compare.empty:
    groups = hist_compare["quote_group_id"].unique()
    
    if len(groups) > 0:
        selected_group = st.selectbox(
            "📂 Selecciona oportunidad",
            groups,
            format_func=lambda x: f"Oportunidad {x[:8]}...",
            key="compare_group_selector"
        )
        
        versions_df = load_versions_for_group(selected_group)
        
        if len(versions_df) >= 2:
            col1, col2, col3 = st.columns([2, 2, 1])
            
            with col1:
                v1 = st.selectbox(
                    "Versión base",
                    versions_df["version"].tolist(),
                    key="v1_selector"
                )
            
            with col2:
                v2 = st.selectbox(
                    "Versión a comparar",
                    versions_df["version"].tolist(),
                    index=len(versions_df)-1,
                    key="v2_selector"
                )
            
            with col3:
                if st.button("🔄 Comparar", type="primary", width="stretch"):
                    if v1 == v2:
                        st.warning("⚠️ Selecciona versiones distintas")
                    else:
                        st.session_state.compare = {
                            "group": selected_group,
                            "v1": int(v1),
                            "v2": int(v2)
                        }
                        st.rerun()
            
            # Motor de comparación
            if "compare" in st.session_state and st.session_state.compare["group"] == selected_group:
                g = st.session_state.compare["group"]
                v1 = st.session_state.compare["v1"]
                v2 = st.session_state.compare["v2"]
                
                st.divider()
                st.subheader(f"📊 Análisis Comparativo: v{v1} → v{v2}")
                
                # ===== SELECTOR DE PLAYBOOK =====
                st.markdown("### 📘 Playbook / Contexto de Industria")
                
                col_playbook, col_playbook_desc = st.columns([1, 2])
                
                with col_playbook:
                    selected_playbook = st.selectbox(
                        "Selecciona playbook",
                        list(PLAYBOOKS.keys()),
                        help="El playbook ajusta umbrales de salud y pesos de decisión según el contexto de negocio"
                    )
                
                with col_playbook_desc:
                    pb_desc = PLAYBOOKS[selected_playbook]["description"]
                    pb_green = PLAYBOOKS[selected_playbook]["green"]
                    pb_yellow = PLAYBOOKS[selected_playbook]["yellow"]
                    st.info(f"**{selected_playbook}:** {pb_desc}  \n📊 Verde ≥{pb_green}% | Amarillo ≥{pb_yellow}%")
                
                st.divider()
                
                # Cargar datos de versiones
                versions = load_versions_for_group(g)
                q1 = versions[versions["version"] == v1].iloc[0]
                q2 = versions[versions["version"] == v2].iloc[0]
                
                # ===== NIVEL A: Resumen Ejecutivo =====
                st.markdown("### 📈 Resumen Ejecutivo")
                
                col_metrics1, col_metrics2, col_metrics3, col_metrics4 = st.columns(4)
                
                with col_metrics1:
                    delta_revenue = float(q2["total_revenue"] - q1["total_revenue"])
                    st.metric(
                        "Ingreso Total",
                        f"${float(q2['total_revenue']):,.2f}",
                        f"${delta_revenue:,.2f}",
                        delta_color="normal"
                    )
                
                with col_metrics2:
                    delta_profit = float(q2["gross_profit"] - q1["gross_profit"])
                    st.metric(
                        "Utilidad Bruta",
                        f"${float(q2['gross_profit']):,.2f}",
                        f"${delta_profit:,.2f}",
                        delta_color="normal"
                    )
                
                with col_metrics3:
                    delta_margin = float(q2["avg_margin"] - q1["avg_margin"])
                    st.metric(
                        "Margen Promedio",
                        f"{float(q2['avg_margin']):.2f}%",
                        f"{delta_margin:+.2f}pp",
                        delta_color="normal"
                    )
                
                with col_metrics4:
                    l1 = load_lines_for_quote(q1["quote_id"])
                    l2 = load_lines_for_quote(q2["quote_id"])
                    delta_lines = len(l2) - len(l1)
                    st.metric(
                        "Líneas",
                        len(l2),
                        f"{delta_lines:+d}",
                        delta_color="off"
                    )
                
                # ===== NIVEL B: Diferencias Clave =====
                st.markdown("### 🎯 Diferencias Clave")
                
                # Tabla comparativa
                comp_df = pd.DataFrame([
                    {
                        "Métrica": "💰 Ingreso Total",
                        f"v{v1}": f"${float(q1['total_revenue']):,.2f}",
                        f"v{v2}": f"${float(q2['total_revenue']):,.2f}",
                        "Δ Absoluto": f"${delta_revenue:,.2f}",
                        "Δ %": f"{(delta_revenue/float(q1['total_revenue'])*100):+.1f}%" if float(q1['total_revenue']) > 0 else "N/A"
                    },
                    {
                        "Métrica": "💵 Costo Total",
                        f"v{v1}": f"${float(q1['total_cost']):,.2f}",
                        f"v{v2}": f"${float(q2['total_cost']):,.2f}",
                        "Δ Absoluto": f"${float(q2['total_cost'] - q1['total_cost']):,.2f}",
                        "Δ %": f"{((float(q2['total_cost']) - float(q1['total_cost']))/float(q1['total_cost'])*100):+.1f}%" if float(q1['total_cost']) > 0 else "N/A"
                    },
                    {
                        "Métrica": "✅ Utilidad Bruta",
                        f"v{v1}": f"${float(q1['gross_profit']):,.2f}",
                        f"v{v2}": f"${float(q2['gross_profit']):,.2f}",
                        "Δ Absoluto": f"${delta_profit:,.2f}",
                        "Δ %": f"{(delta_profit/float(q1['gross_profit'])*100):+.1f}%" if float(q1['gross_profit']) > 0 else "N/A"
                    },
                    {
                        "Métrica": "📊 Margen Promedio",
                        f"v{v1}": f"{float(q1['avg_margin']):.2f}%",
                        f"v{v2}": f"{float(q2['avg_margin']):.2f}%",
                        "Δ Absoluto": f"{delta_margin:+.2f}pp",
                        "Δ %": f"{(delta_margin/float(q1['avg_margin'])*100):+.1f}%" if float(q1['avg_margin']) > 0 else "N/A"
                    },
                    {
                        "Métrica": "📋 Número de Líneas",
                        f"v{v1}": str(len(l1)),
                        f"v{v2}": str(len(l2)),
                        "Δ Absoluto": f"{delta_lines:+d}",
                        "Δ %": f"{(delta_lines/len(l1)*100):+.1f}%" if len(l1) > 0 else "N/A"
                    }
                ])
                
                st.dataframe(comp_df, width="stretch", hide_index=True)
                
                # Análisis de líneas
                st.markdown("### 📦 Análisis de Líneas")
                
                # Detectar cambios en SKUs
                skus_v1 = set(l1["sku"].tolist())
                skus_v2 = set(l2["sku"].tolist())
                
                skus_added = skus_v2 - skus_v1
                skus_removed = skus_v1 - skus_v2
                skus_common = skus_v1 & skus_v2
                
                col_changes1, col_changes2, col_changes3 = st.columns(3)
                
                with col_changes1:
                    st.metric("➕ Líneas Agregadas", len(skus_added))
                    if skus_added:
                        for sku in skus_added:
                            line = l2[l2["sku"] == sku].iloc[0]
                            st.caption(f"  • {sku}: ${float(line['final_price_unit']):,.2f}")
                
                with col_changes2:
                    st.metric("➖ Líneas Eliminadas", len(skus_removed))
                    if skus_removed:
                        for sku in skus_removed:
                            line = l1[l1["sku"] == sku].iloc[0]
                            st.caption(f"  • {sku}: ${float(line['final_price_unit']):,.2f}")
                
                with col_changes3:
                    st.metric("🔄 Líneas Modificadas", len([s for s in skus_common if float(l1[l1["sku"]==s]["final_price_unit"].iloc[0]) != float(l2[l2["sku"]==s]["final_price_unit"].iloc[0])]))
                
                # ===== NIVEL C: Visualizaciones =====
                st.markdown("### 📊 Visualizaciones")
                
                col_chart1, col_chart2 = st.columns(2)
                
                with col_chart1:
                    st.markdown("**Ingreso vs Utilidad**")
                    fig1, ax1 = plt.subplots(figsize=(6, 4))
                    
                    x_labels = [f"v{v1}", f"v{v2}"]
                    x_pos = range(len(x_labels))
                    width = 0.35
                    
                    ax1.bar([p - width/2 for p in x_pos], 
                           [float(q1["total_revenue"]), float(q2["total_revenue"])], 
                           width, label="Ingreso", color="#1f77b4")
                    ax1.bar([p + width/2 for p in x_pos], 
                           [float(q1["gross_profit"]), float(q2["gross_profit"])], 
                           width, label="Utilidad", color="#2ca02c")
                    
                    ax1.set_xticks(x_pos)
                    ax1.set_xticklabels(x_labels)
                    ax1.set_ylabel("Monto ($)")
                    ax1.set_title("Ingreso vs Utilidad por Versión")
                    ax1.legend()
                    plt.tight_layout()
                    st.pyplot(fig1)
                
                with col_chart2:
                    st.markdown("**Aportación por Componente**")
                    
                    # Agrupar por componente
                    c1 = l1.groupby("service_origin")["final_price_unit"].sum()
                    c2 = l2.groupby("service_origin")["final_price_unit"].sum()
                    
                    comp_components = pd.concat([c1, c2], axis=1).fillna(0)
                    comp_components.columns = [f"v{v1}", f"v{v2}"]
                    
                    fig2, ax2 = plt.subplots(figsize=(6, 4))
                    comp_components.plot(kind="bar", ax=ax2, rot=45, width=0.8)
                    ax2.set_ylabel("Monto ($)")
                    ax2.set_title("Componentes por Versión")
                    ax2.legend()
                    plt.tight_layout()
                    st.pyplot(fig2)
                
                # Tabla detallada de componentes
                st.markdown("### 📦 Detalle por Componente")
                
                comp_components["Δ Absoluto"] = comp_components[f"v{v2}"] - comp_components[f"v{v1}"]
                comp_components["Δ %"] = ((comp_components[f"v{v2}"] - comp_components[f"v{v1}"]) / comp_components[f"v{v1}"] * 100).replace([float('inf'), -float('inf')], 0).fillna(0)
                
                # Formatear para display
                display_comp = comp_components.copy()
                display_comp[f"v{v1}"] = display_comp[f"v{v1}"].apply(lambda x: f"${x:,.2f}")
                display_comp[f"v{v2}"] = display_comp[f"v{v2}"].apply(lambda x: f"${x:,.2f}")
                display_comp["Δ Absoluto"] = display_comp["Δ Absoluto"].apply(lambda x: f"${x:,.2f}")
                display_comp["Δ %"] = display_comp["Δ %"].apply(lambda x: f"{x:+.1f}%")
                
                st.dataframe(display_comp, width="stretch")
                
                # ===== NARRATIVA AUTOMÁTICA =====
                st.markdown("### 📝 Narrativa Automática")
                
                # Generar narrativa estructurada con playbook
                narrative = generate_comparison_narrative(
                    q1=q1,
                    q2=q2,
                    df1=l1,
                    df2=l2,
                    playbook_name=selected_playbook
                )
                
                # Mostrar narrativa ejecutiva
                st.info(f"**Resumen Ejecutivo:** {narrative['executive']}")
                
                # Mostrar detalle técnico
                if narrative["detail"]:
                    with st.expander("📋 Ver detalle técnico", expanded=False):
                        st.write(narrative["detail"])
                
                # Indicadores de salud
                col_health1, col_health2 = st.columns(2)
                
                with col_health1:
                    health_color = {"verde": "🟢", "amarillo": "🟡", "rojo": "🔴"}
                    st.caption(f"Salud v{v1}: {health_color[narrative['health_v1']]} {narrative['health_v1'].upper()}")
                
                with col_health2:
                    st.caption(f"Salud v{v2}: {health_color[narrative['health_v2']]} {narrative['health_v2'].upper()}")
                
                st.divider()
                
                # ===== REFORMULACIÓN CON IA =====
                st.markdown("### 🎯 Reformular Narrativa con IA")
                st.caption("La IA reformula el lenguaje según la audiencia, sin cambiar cifras ni recomendaciones.")
                
                col_audience, col_button = st.columns([3, 1])
                
                with col_audience:
                    audience = st.selectbox(
                        "Selecciona audiencia",
                        [
                            "Cliente ejecutivo",
                            "Comité financiero",
                            "Uso interno (ventas)"
                        ],
                        key="audience_selector",
                        help="La IA ajustará el tono y claridad según la audiencia seleccionada"
                    )
                
                with col_button:
                    generate_ai = st.button("✨ Generar", type="primary", width="stretch", key="generate_ai_narrative")
                
                # Generar narrativa reformulada si se presiona el botón
                if generate_ai:
                    ai_text = ai_rewrite_narrative(
                        audience=audience,
                        executive=narrative["executive"],
                        detail=narrative["detail"]
                    )
                    
                    st.markdown("#### 🧠 Narrativa Reformulada")
                    st.success(ai_text)
                    
                    # Botón para copiar al portapapeles
                    st.caption("💡 Tip: Copia este texto para emails, reportes o presentaciones.")
                
                st.divider()
                
                # ===== EXPORTACIÓN PDF EJECUTIVO =====
                st.markdown("### 📄 Exportación Ejecutiva")
                st.caption("Genera un reporte PDF profesional con el análisis completo.")
                
                col_pdf1, col_pdf2 = st.columns([2, 1])
                
                with col_pdf1:
                    pdf_branding_name = st.text_input(
                        "Nombre de la empresa (opcional)",
                        value="DynamiQuote",
                        help="Aparecerá en el encabezado y portada del PDF"
                    )
                
                with col_pdf2:
                    st.write("")  # Espaciado
                    generate_pdf = st.button("📥 Descargar PDF", type="primary", width="stretch", key="generate_pdf_btn")
                
                if generate_pdf:
                    try:
                        # Importar módulo de PDF
                        from pdf_generator import prepare_report_data, generate_pdf_report, WEASYPRINT_AVAILABLE
                        
                        if not WEASYPRINT_AVAILABLE:
                            st.error("⚠️ WeasyPrint no está instalado. Ejecutar: `pip install weasyprint`")
                        else:
                            with st.spinner("Generando PDF ejecutivo..."):
                                # Preparar datos estructurados
                                report_data = prepare_report_data(
                                    q1=q1,
                                    q2=q2,
                                    df1=l1,
                                    df2=l2,
                                    narrative=narrative,
                                    playbook_name=selected_playbook,
                                    playbook_config=PLAYBOOKS[selected_playbook]
                                )
                                
                                # Configurar branding
                                branding = {
                                    'logo_url': None,  # Futuro: permitir subir logo
                                    'primary_color': '#4F46E5',
                                    'secondary_color': '#F59E0B',
                                    'company_name': pdf_branding_name
                                }
                                
                                # Generar PDF
                                pdf_bytes = generate_pdf_report(report_data, branding)
                                
                                # Botón de descarga
                                st.download_button(
                                    label="⬇️ Descargar Reporte PDF",
                                    data=pdf_bytes,
                                    file_name=f"analisis_comparativo_v{v1}_v{v2}_{datetime.now().strftime('%Y%m%d')}.pdf",
                                    mime="application/pdf",
                                    width="stretch"
                                )
                                
                                st.success("✅ PDF generado exitosamente. Haz click en 'Descargar Reporte PDF' arriba.")
                    
                    except ImportError as e:
                        st.error(f"⚠️ Error de importación: {e}. Asegúrate de tener todos los requisitos instalados.")
                    except Exception as e:
                        st.error(f"❌ Error generando PDF: {e}")
                        import traceback
                        with st.expander("Ver detalles del error"):
                            st.code(traceback.format_exc())
                
                st.divider()
                
                # Insight automático
                st.markdown("### 💡 Insight Rápido")
                
                insights = []
                
                if delta_revenue > 0 and delta_margin > 0:
                    insights.append("✅ **Versión superior:** Mayor ingreso Y mejor margen")
                elif delta_revenue > 0 and delta_margin < 0:
                    insights.append("⚠️ **Crecimiento agresivo:** Más ingreso pero sacrificó margen")
                elif delta_revenue < 0 and delta_margin > 0:
                    insights.append("🎯 **Optimización:** Menos ingreso pero margen mejoró")
                else:
                    insights.append("❌ **Deterioro:** Menos ingreso Y peor margen")
                
                if len(skus_added) > len(skus_removed):
                    insights.append(f"📈 **Expansión:** Se agregaron {len(skus_added)} líneas vs {len(skus_removed)} eliminadas")
                elif len(skus_removed) > len(skus_added):
                    insights.append(f"📉 **Simplificación:** Se eliminaron {len(skus_removed)} líneas vs {len(skus_added)} agregadas")
                
                # Componente que más cambió
                if not comp_components.empty:
                    max_change = comp_components["Δ Absoluto"].abs().idxmax()
                    max_change_value = comp_components.loc[max_change, "Δ Absoluto"]
                    if abs(max_change_value) > 0:
                        insights.append(f"🎯 **Componente clave:** '{max_change}' cambió ${abs(max_change_value):,.2f}")
                
                for insight in insights:
                    st.markdown(insight)
        
        elif len(versions_df) == 1:
            st.info("📝 Esta oportunidad solo tiene 1 versión. Crea una nueva versión para comparar.")
        else:
            st.info("📝 No hay versiones disponibles para esta oportunidad.")
    else:
        st.info("📝 No hay oportunidades guardadas aún.")
else:
    st.info("📝 No hay datos para comparar. Crea y guarda cotizaciones primero.")

st.divider()

# =========================
# Formulario
# =========================
st.subheader("➕ Agregar línea")

# Mostrar información de versión actual
version_info = f"📝 Oportunidad: {st.session_state.quote_group_id[:8]}... | Versión: {st.session_state.version}"
if st.session_state.parent_quote_id:
    version_info += f" (basada en versión anterior)"
st.info(version_info)

# Mostrar errores persistentes de OpenAI si existen
if 'ai_error' in st.session_state:
    error_container = st.container()
    with error_container:
        col1, col2 = st.columns([4, 1])
        with col1:
            st.error(st.session_state.ai_error)
        with col2:
            if st.button("❌ Cerrar", key="dismiss_error"):
                del st.session_state.ai_error
                st.rerun()

# Si hay una línea pendiente de confirmación (con correcciones)
if st.session_state.pending_line:
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
    
    col_a, col_b = st.columns(2)
    with col_a:
        if st.button("✅ Usar descripción corregida", type="primary", width="stretch"):
            # Usar versión corregida
            pending["description_final"] = pending["corrected_desc"]
            st.session_state.lines.append(pending)
            st.session_state.pending_line = None
            st.success("✅ Línea agregada con descripción corregida")
            st.rerun()
    
    with col_b:
        if st.button("❌ Usar descripción original", width="stretch"):
            # Usar versión original
            pending["description_final"] = pending["description_input"]
            st.session_state.lines.append(pending)
            st.session_state.pending_line = None
            st.success("✅ Línea agregada con descripción original")
            st.rerun()
    
    st.divider()

# =========================
# IMPORTACIÓN DESDE EXCEL
# =========================
with st.expander("📥 O importa múltiples líneas desde Excel", expanded=False):
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
            col1.metric("✅ Filas válidas", report["valid_rows"])
            col2.metric("❌ Filas con errores", report["error_rows"])
            col3.metric("📦 Total procesado", report["total_rows"])
            
            # Mostrar duplicados detectados
            if import_result["duplicates"]:
                st.warning(f"⚠️ Se detectaron {len(import_result['duplicates'])} posibles duplicados:")
                with st.expander("Ver duplicados detectados"):
                    for dup in import_result["duplicates"]:
                        st.markdown(f"- **{dup['new_description']}** similar a *{dup['existing_description']}* ({dup['similarity']}%)")
            
            # Preview editable
            st.subheader("📋 Preview - Editar antes de importar")
            st.caption("Edita SKU, Descripción, Cantidad, Margen, Precio. Los cambios se aplican antes de confirmar.")
            
            # Convertir a DataFrame para edición
            preview_data = []
            for line in import_result["lines"]:
                preview_data.append({
                    "SKU": line["sku"],
                    "Descripción": line["description_original"],
                    "Cantidad": line.get("_cantidad", 1),
                    "Costo Unit": line["cost_unit"],
                    "Margen %": line["margin_pct"],
                    "Precio Unit": line["final_price_unit"],
                    "Tipo": line["line_type"],
                    "Origen": line["service_origin"],
                    "Estrategia": line["strategy"]
                })
            
            preview_df = pd.DataFrame(preview_data)
            
            edited_df = st.data_editor(
                preview_df,
                column_config={
                    "SKU": st.column_config.TextColumn(width="medium", help="SKU del producto"),
                    "Descripción": st.column_config.TextColumn(width="large", help="Descripción editable"),
                    "Cantidad": st.column_config.NumberColumn(min_value=1, format="%d", help="Cantidad a cotizar"),
                    "Costo Unit": st.column_config.NumberColumn(min_value=0, format="$%.2f", help="Costo unitario"),
                    "Margen %": st.column_config.NumberColumn(min_value=0, max_value=99, format="%.1f%%", help="Margen objetivo"),
                    "Precio Unit": st.column_config.NumberColumn(min_value=0, format="$%.2f", help="Precio de venta unitario"),
                    "Tipo": st.column_config.SelectboxColumn(options=["product", "service"]),
                    "Origen": st.column_config.SelectboxColumn(
                        options=["producto", "refacciones", "póliza", "implementación", "soporte", "capacitación", "otro"]
                    ),
                    "Estrategia": st.column_config.SelectboxColumn(
                        options=["penetration", "defense", "upsell", "renewal"]
                    )
                },
                num_rows="dynamic",
                width="stretch",
                key="preview_editor"
            )
            
            # Botones de acción
            col_confirm, col_cancel = st.columns(2)
            
            with col_confirm:
                if st.button("✅ Confirmar e Importar Todo", type="primary", width="stretch"):
                    # Aplicar ediciones a las líneas originales
                    for idx, line in enumerate(import_result["lines"]):
                        if idx < len(edited_df):
                            line["sku"] = edited_df.iloc[idx]["SKU"]
                            line["description_original"] = edited_df.iloc[idx]["Descripción"]
                            line["_cantidad"] = int(edited_df.iloc[idx]["Cantidad"])
                            line["cost_unit"] = float(edited_df.iloc[idx]["Costo Unit"])
                            line["margin_pct"] = float(edited_df.iloc[idx]["Margen %"])
                            line["final_price_unit"] = float(edited_df.iloc[idx]["Precio Unit"])
                            line["line_type"] = edited_df.iloc[idx]["Tipo"]
                            line["service_origin"] = edited_df.iloc[idx]["Origen"]
                            line["strategy"] = edited_df.iloc[idx]["Estrategia"]
                    
                    # Aplicar corrección ortográfica a todas las líneas
                    for line in import_result["lines"]:
                        corrected_desc, corrections = suggest_description_fix(line["description_original"])
                        line["description_final"] = corrected_desc
                        line["description_corrections"] = ", ".join(corrections)
                    
                    # Agregar a session state
                    st.session_state.lines.extend(import_result["lines"])
                    
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
                    
                    st.success(f"✅ {len(import_result['lines'])} líneas importadas correctamente")
                    st.rerun()
            
            with col_cancel:
                if st.button("❌ Cancelar Import", width="stretch"):
                    st.rerun()

st.divider()

with st.form("add_line", clear_on_submit=True):
    col1, col2, col3 = st.columns(3)

    with col1:
        sku = st.text_input("SKU *")
        description_input = st.text_input("Descripción *")
        line_type = st.selectbox("Tipo de línea", ["product", "service"])

    with col2:
        service_origin = st.selectbox(
            "Origen / componente",
            ["producto", "refacciones", "póliza", "implementación", "soporte", "capacitación", "otro"]
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

# =========================
# Mostrar cotización
# =========================
if st.session_state.lines:
    st.subheader("📊 Cotización en curso")

    df = pd.DataFrame(st.session_state.lines)

    total_cost = df["cost_unit"].sum()
    total_revenue = df["final_price_unit"].sum()
    gross_profit = total_revenue - total_cost
    avg_margin = round(df["margin_pct"].mean(), 2)

    colA, colB, colC, colD = st.columns(4)
    colA.metric("Ingreso total", f"${round(total_revenue,2)}")
    colB.metric("Costo total", f"${round(total_cost,2)}")
    colC.metric("Utilidad bruta", f"${round(gross_profit,2)}")
    colD.metric("Margen promedio %", avg_margin)

    st.dataframe(
        df[[
            "sku",
            "description_final",
            "line_type",
            "service_origin",
            "strategy",
            "cost_unit",
            "final_price_unit",
            "margin_pct",
            "warnings"
        ]],
        width='stretch'
    )

    # =========================
    # Gráficas lado a lado
    # =========================
    st.subheader("📊 Visualizaciones")

    col_graph1, col_graph2 = st.columns(2)

    with col_graph1:
        st.markdown("**Aportación por componente**")
        comp_df = df.groupby("service_origin")["final_price_unit"].sum().reset_index()
        fig1, ax1 = plt.subplots(figsize=(6, 4))
        ax1.bar(comp_df["service_origin"], comp_df["final_price_unit"])
        ax1.set_xticks(range(len(comp_df)))
        ax1.set_xticklabels(comp_df["service_origin"], rotation=30, ha='right')
        ax1.set_ylabel("Monto total")
        ax1.set_title("Aportación total por componente")
        plt.tight_layout()
        st.pyplot(fig1)

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

    # =========================
    # Cerrar propuesta
    # =========================
    st.subheader("✅ Cerrar y guardar propuesta")
    
    # Selector de playbook antes de guardar
    col_save_pb, col_save_btn = st.columns([2, 1])
    
    with col_save_pb:
        save_playbook = st.selectbox(
            "📘 Playbook a aplicar",
            list(PLAYBOOKS.keys()),
            help="El playbook determina cómo se evaluará esta cotización en comparaciones futuras"
        )
        pb_save = PLAYBOOKS[save_playbook]
        st.caption(f"Verde ≥{pb_save['green']}% | Amarillo ≥{pb_save['yellow']}%")

    with col_save_btn:
        st.write("")  # Espaciado
        save_button = st.button("Cerrar propuesta", type="primary")

    if save_button:
        # Preparar datos para guardar (convertir numpy/pandas a tipos nativos Python)
        quote_data = (
            st.session_state.quote_id,
            st.session_state.quote_group_id,
            st.session_state.version,
            st.session_state.parent_quote_id,
            datetime.now(UTC).isoformat(),
            "CLOSED",
            float(total_cost),
            float(total_revenue),
            float(gross_profit),
            float(avg_margin),
            save_playbook  # Agregar playbook seleccionado
        )
        
        lines_data = []
        for _, row in df.iterrows():
            lines_data.append((
                str(row["line_id"]),
                str(st.session_state.quote_id),
                str(row["sku"]),
                str(row["description_original"]),
                str(row["description_final"]),
                str(row["description_corrections"]),
                str(row["line_type"]),
                str(row["service_origin"]),
                float(row["cost_unit"]),
                float(row["final_price_unit"]),
                float(row["margin_pct"]) if row["margin_pct"] is not None else None,
                str(row["strategy"]),
                str(row["warnings"]),
                str(row["created_at"]),
                str(row.get("import_source", "manual")),
                str(row.get("import_batch_id", "")) if row.get("import_batch_id") else None
            ))
        
        # Guardar usando función segura
        success, message = save_quote(quote_data, lines_data)
        
        if success:
            st.success(message)
            # Reiniciar para nueva cotización
            st.session_state.lines = []
            st.session_state.quote_id = str(uuid.uuid4())
            st.session_state.quote_group_id = str(uuid.uuid4())
            st.session_state.version = 1
            st.session_state.parent_quote_id = None
            st.rerun()
        else:
            st.error(message)

else:
    st.info("Agrega líneas para iniciar una cotización")

# =========================
# Base de datos de propuestas
# =========================
st.divider()
st.header("📚 Base de Datos de Propuestas")

# Obtener propuestas cerradas
quotes_query = get_all_quotes()

if quotes_query:
    # Agrupar por quote_group_id para mostrar versiones
    st.subheader("🗂️ Oportunidades y Versiones")
    
    # Convertir a DataFrame para agrupar
    all_quotes_df = pd.DataFrame(
        quotes_query,
        columns=["ID", "Group ID", "Versión", "Parent ID", "Fecha", "Estado", "Costo Total", "Ingreso Total", "Utilidad Bruta", "Margen Promedio %"]
    )
    
    # Agrupar por Group ID
    for group_id, group_df in all_quotes_df.groupby("Group ID"):
        with st.expander(f"🎯 Oportunidad {group_id[:8]}... ({len(group_df)} versiones)", expanded=False):
            for _, q in group_df.iterrows():
                col1, col2, col3, col4, col5 = st.columns([1, 2, 2, 2, 2])
                
                with col1:
                    st.markdown(f"**v{int(q['Versión'])}**")
                
                with col2:
                    fecha = pd.to_datetime(q['Fecha']).strftime("%Y-%m-%d %H:%M")
                    st.caption(f"📅 {fecha}")
                
                with col3:
                    st.metric("Ingreso", f"${q['Ingreso Total']:,.2f}")
                
                with col4:
                    st.metric("Margen", f"{q['Margen Promedio %']:.2f}%")
                
                with col5:
                    if st.button("➕ Nueva versión", key=f"new_v_{q['ID']}"):
                        # Cargar líneas de esta versión
                        lines_full = get_quote_lines_full(q['ID'])
                        
                        if lines_full:
                            # Preparar nuevas líneas con nuevos IDs
                            new_lines = []
                            for line in lines_full:
                                new_lines.append({
                                    "line_id": str(uuid.uuid4()),  # Nuevo ID
                                    "sku": line[2],
                                    "description_original": line[3],
                                    "description_input": line[3],
                                    "description_final": line[4],
                                    "description_corrections": line[5],
                                    "corrected_desc": line[4],
                                    "corrections": line[5].split(", ") if line[5] else [],
                                    "line_type": line[6],
                                    "service_origin": line[7],
                                    "cost_unit": line[8],
                                    "final_price_unit": line[9],
                                    "margin_pct": line[10],
                                    "strategy": line[11],
                                    "warnings": line[12],
                                    "created_at": datetime.now(UTC).isoformat()
                                })
                            
                            # Configurar nueva versión
                            st.session_state.quote_group_id = q['Group ID']
                            st.session_state.version = int(q['Versión']) + 1
                            st.session_state.parent_quote_id = q['ID']
                            st.session_state.quote_id = str(uuid.uuid4())
                            st.session_state.lines = new_lines
                            st.success(f"✅ Versión {int(q['Versión']) + 1} creada. Modifica las líneas y guarda.")
                            st.rerun()
                
                # Mostrar líneas de esta versión
                with st.container():
                    st.caption(f"📋 Líneas de v{int(q['Versión'])}")
                    lines = get_quote_lines(q['ID'])
                    if lines:
                        lines_df = pd.DataFrame(
                            lines,
                            columns=["SKU", "Descripción", "Tipo", "Origen", "Costo Unit.", "Precio Unit.", "Margen %", "Estrategia", "Advertencias"]
                        )
                        st.dataframe(lines_df, hide_index=True, width="stretch")
                
                st.divider()
    
    st.divider()
    
    # Vista consolidada (anterior)
    st.subheader("📊 Vista Consolidada")
    quotes_df = pd.DataFrame(
        quotes_query,
        columns=["ID", "Group ID", "Versión", "Parent ID", "Fecha", "Estado", "Costo Total", "Ingreso Total", "Utilidad Bruta", "Margen Promedio %"]
    )
    
    # Formatear fecha
    quotes_df["Fecha"] = pd.to_datetime(quotes_df["Fecha"]).dt.strftime("%Y-%m-%d %H:%M")
    
    # Formatear montos
    quotes_df["Costo Total"] = quotes_df["Costo Total"].apply(lambda x: f"${x:,.2f}")
    quotes_df["Ingreso Total"] = quotes_df["Ingreso Total"].apply(lambda x: f"${x:,.2f}")
    quotes_df["Utilidad Bruta"] = quotes_df["Utilidad Bruta"].apply(lambda x: f"${x:,.2f}")
    quotes_df["Margen Promedio %"] = quotes_df["Margen Promedio %"].apply(lambda x: f"{x:.2f}%")
    
    # Mostrar solo columnas relevantes
    display_df = quotes_df[["Group ID", "Versión", "Fecha", "Costo Total", "Ingreso Total", "Utilidad Bruta", "Margen Promedio %"]].copy()
    display_df["Group ID"] = display_df["Group ID"].apply(lambda x: f"{x[:8]}...")
    
    st.dataframe(display_df, width='stretch', hide_index=True)
    
    # Selector de propuesta para ver detalle
    st.subheader("🔍 Ver detalle de propuesta")
    quote_ids = [q[0] for q in quotes_query]
    selected_quote = st.selectbox(
        "Selecciona una propuesta",
        options=quote_ids,
        format_func=lambda x: f"Propuesta {x[:8]}..."
    )
    
    if selected_quote:
        # Obtener líneas de la propuesta seleccionada
        lines_query = get_quote_lines(selected_quote)
        
        if lines_query:
            lines_detail_df = pd.DataFrame(
                lines_query,
                columns=["SKU", "Descripción", "Tipo", "Origen", "Costo Unit.", "Precio Unit.", "Margen %", "Estrategia", "Advertencias"]
            )
            
            st.dataframe(lines_detail_df, width='stretch', hide_index=True)
            
            # Estadísticas de la propuesta seleccionada
            st.subheader("📊 Estadísticas")
            col1, col2, col3 = st.columns(3)
            
            total_lines = len(lines_query)
            products = sum(1 for line in lines_query if line[2] == "product")
            services = sum(1 for line in lines_query if line[2] == "service")
            
            col1.metric("Total de líneas", total_lines)
            col2.metric("Productos", products)
            col3.metric("Servicios", services)
else:
    st.info("No hay propuestas guardadas aún")

# Info de base de datos en footer
db_info = get_database_info()
st.caption(f"MVP Cotizador Universal | {db_info['icon']} {db_info['type']} | Corrección de typos | Estado productivo")
