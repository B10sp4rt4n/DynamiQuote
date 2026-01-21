import streamlit as st
import pandas as pd
import sqlite3
import uuid
from datetime import datetime
import matplotlib.pyplot as plt
from spellchecker import SpellChecker

# =========================
# Configuración
# =========================
st.set_page_config(page_title="Quote Intelligence MVP", layout="wide")
st.title("🧾 Cotizador Universal – MVP Funcional")

DB_NAME = "quotes_mvp.db"

# =========================
# Spellchecker
# =========================
spell = SpellChecker(language="es")

def suggest_description_fix(text):
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

# =========================
# DB Init
# =========================
conn = sqlite3.connect(DB_NAME)
cur = conn.cursor()

cur.execute("""
CREATE TABLE IF NOT EXISTS quotes (
    quote_id TEXT PRIMARY KEY,
    created_at TEXT,
    status TEXT,
    total_cost REAL,
    total_revenue REAL,
    gross_profit REAL,
    avg_margin REAL
)
""")

cur.execute("""
CREATE TABLE IF NOT EXISTS quote_lines (
    line_id TEXT PRIMARY KEY,
    quote_id TEXT,
    sku TEXT,
    description_original TEXT,
    description_final TEXT,
    description_corrections TEXT,
    line_type TEXT,
    service_origin TEXT,
    cost_unit REAL,
    final_price_unit REAL,
    margin_pct REAL,
    strategy TEXT,
    warnings TEXT,
    created_at TEXT
)
""")

conn.commit()

# =========================
# Session state
# =========================
if "quote_id" not in st.session_state:
    st.session_state.quote_id = str(uuid.uuid4())

if "lines" not in st.session_state:
    st.session_state.lines = []

# =========================
# Formulario
# =========================
st.subheader("➕ Agregar línea")

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

    if submit:
        # ---- Corrección de descripción
        corrected_desc, corrections = suggest_description_fix(description_input)
        use_corrected = False

        if corrections:
            st.warning("Se detectaron posibles errores en la descripción")
            st.markdown("**Sugerencia:**")
            st.write(corrected_desc)
            use_corrected = st.checkbox("Usar descripción corregida")

        description_final = corrected_desc if use_corrected else description_input

        # ---- Cálculos
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

        st.session_state.lines.append({
            "line_id": str(uuid.uuid4()),
            "sku": sku,
            "description_original": description_input,
            "description_final": description_final,
            "description_corrections": ", ".join(corrections),
            "line_type": line_type,
            "service_origin": service_origin,
            "cost_unit": cost,
            "final_price_unit": final_price,
            "margin_pct": margin_pct,
            "strategy": strategy,
            "warnings": ", ".join(warnings),
            "created_at": datetime.utcnow().isoformat()
        })

        st.success("Línea agregada correctamente")

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
        use_container_width=True
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
        cur.execute(
            "INSERT INTO quotes VALUES (?,?,?,?,?,?,?)",
            (
                st.session_state.quote_id,
                datetime.utcnow().isoformat(),
                "CLOSED",
                total_cost,
                total_revenue,
                gross_profit,
                avg_margin
            )
        )

        for _, row in df.iterrows():
            cur.execute(
                "INSERT INTO quote_lines VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    row["line_id"],
                    st.session_state.quote_id,
                    row["sku"],
                    row["description_original"],
                    row["description_final"],
                    row["description_corrections"],
                    row["line_type"],
                    row["service_origin"],
                    row["cost_unit"],
                    row["final_price_unit"],
                    row["margin_pct"],
                    row["strategy"],
                    row["warnings"],
                    row["created_at"]
                )
            )

        conn.commit()
        st.success("✅ Propuesta guardada correctamente")

        st.session_state.lines = []
        st.session_state.quote_id = str(uuid.uuid4())
        st.rerun()

else:
    st.info("Agrega líneas para iniciar una cotización")

# =========================
# Base de datos de propuestas
# =========================
st.divider()
st.header("📚 Base de Datos de Propuestas")

# Obtener propuestas cerradas
quotes_query = cur.execute("""
    SELECT quote_id, created_at, status, total_cost, total_revenue, gross_profit, avg_margin
    FROM quotes
    ORDER BY created_at DESC
""").fetchall()

if quotes_query:
    quotes_df = pd.DataFrame(
        quotes_query,
        columns=["ID", "Fecha", "Estado", "Costo Total", "Ingreso Total", "Utilidad Bruta", "Margen Promedio %"]
    )
    
    # Formatear fecha
    quotes_df["Fecha"] = pd.to_datetime(quotes_df["Fecha"]).dt.strftime("%Y-%m-%d %H:%M")
    
    # Formatear montos
    quotes_df["Costo Total"] = quotes_df["Costo Total"].apply(lambda x: f"${x:,.2f}")
    quotes_df["Ingreso Total"] = quotes_df["Ingreso Total"].apply(lambda x: f"${x:,.2f}")
    quotes_df["Utilidad Bruta"] = quotes_df["Utilidad Bruta"].apply(lambda x: f"${x:,.2f}")
    quotes_df["Margen Promedio %"] = quotes_df["Margen Promedio %"].apply(lambda x: f"{x:.2f}%")
    
    st.dataframe(quotes_df, use_container_width=True, hide_index=True)
    
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
        lines_query = cur.execute("""
            SELECT sku, description_final, line_type, service_origin, 
                   cost_unit, final_price_unit, margin_pct, strategy, warnings
            FROM quote_lines
            WHERE quote_id = ?
        """, (selected_quote,)).fetchall()
        
        if lines_query:
            lines_detail_df = pd.DataFrame(
                lines_query,
                columns=["SKU", "Descripción", "Tipo", "Origen", "Costo Unit.", "Precio Unit.", "Margen %", "Estrategia", "Advertencias"]
            )
            
            st.dataframe(lines_detail_df, use_container_width=True, hide_index=True)
            
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

st.caption("MVP Cotizador Universal | SQLite | Corrección de typos | Estado productivo")
