import streamlit as st
import pandas as pd
import uuid
from datetime import datetime, UTC
import matplotlib.pyplot as plt
from spellchecker import SpellChecker
from database import init_database, save_quote, get_all_quotes, get_quote_lines, get_quote_lines_full, get_latest_version, get_database_info
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
        if st.button("✅ Usar descripción corregida", type="primary", use_container_width=True):
            # Usar versión corregida
            pending["description_final"] = pending["corrected_desc"]
            st.session_state.lines.append(pending)
            st.session_state.pending_line = None
            st.success("✅ Línea agregada con descripción corregida")
            st.rerun()
    
    with col_b:
        if st.button("❌ Usar descripción original", use_container_width=True):
            # Usar versión original
            pending["description_final"] = pending["description_input"]
            st.session_state.lines.append(pending)
            st.session_state.pending_line = None
            st.success("✅ Línea agregada con descripción original")
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

    if st.button("Cerrar propuesta"):
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
            float(avg_margin)
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
                str(row["created_at"])
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
                        st.dataframe(lines_df, hide_index=True, use_container_width=True)
                
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
    display_df = quotes_df[["Group ID", "Versión", "Fecha", "Costo Total", "Ingreso Total", "Utilidad Bruta", "Margen Promedio %"]]
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
