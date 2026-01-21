"""
Módulo de generación de reportes PDF ejecutivos para DynamiQuote.

Este módulo SOLO renderiza. No calcula nada.
Recibe datos estructurados y genera PDF profesional.
"""

import os
import io
import base64
from datetime import datetime
from typing import Dict, Any, Optional
import matplotlib
matplotlib.use('Agg')  # Backend sin GUI
import matplotlib.pyplot as plt
from jinja2 import Template
import uuid

# Intentar importar WeasyPrint (opcional)
try:
    from weasyprint import HTML, CSS
    WEASYPRINT_AVAILABLE = True
except ImportError:
    WEASYPRINT_AVAILABLE = False
    print("⚠️ WeasyPrint no disponible. Instalar con: pip install weasyprint")


def format_money(value):
    """Formatea número como moneda."""
    try:
        return f"{float(value):,.2f}"
    except:
        return "0.00"


def generate_comparison_charts(data: Dict[str, Any]) -> Dict[str, str]:
    """
    Genera gráficos de comparación y retorna paths/base64.
    
    Args:
        data: Datos estructurados de la comparación
    
    Returns:
        Dict con paths o base64 de gráficos
    """
    charts = {}
    
    try:
        # Gráfico 1: Ingreso vs Utilidad
        fig1, ax1 = plt.subplots(figsize=(8, 5))
        
        versions = [f"v{data['version_base']}", f"v{data['version_compared']}"]
        revenue_data = [data['metrics']['revenue_v1'], data['metrics']['revenue_v2']]
        profit_data = [data['metrics']['profit_v1'], data['metrics']['profit_v2']]
        
        x = range(len(versions))
        width = 0.35
        
        bars1 = ax1.bar([i - width/2 for i in x], revenue_data, width, label='Ingreso', color='#4F46E5')
        bars2 = ax1.bar([i + width/2 for i in x], profit_data, width, label='Utilidad', color='#10B981')
        
        ax1.set_ylabel('Monto ($)', fontsize=10)
        ax1.set_title('Ingreso vs Utilidad por Versión', fontsize=12, fontweight='bold')
        ax1.set_xticks(x)
        ax1.set_xticklabels(versions)
        ax1.legend()
        ax1.grid(axis='y', alpha=0.3)
        
        # Formatear eje Y
        ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:,.0f}'))
        
        plt.tight_layout()
        
        # Guardar como base64
        buffer1 = io.BytesIO()
        plt.savefig(buffer1, format='png', dpi=150, bbox_inches='tight')
        buffer1.seek(0)
        charts['revenue_profit'] = f"data:image/png;base64,{base64.b64encode(buffer1.read()).decode()}"
        plt.close(fig1)
        
        # Gráfico 2: Componentes
        if data.get('components') and len(data['components']) > 0:
            fig2, ax2 = plt.subplots(figsize=(8, 5))
            
            component_names = [c['name'] for c in data['components']]
            v1_values = [c['v1'] for c in data['components']]
            v2_values = [c['v2'] for c in data['components']]
            
            x2 = range(len(component_names))
            
            bars1 = ax2.bar([i - width/2 for i in x2], v1_values, width, 
                           label=f"v{data['version_base']}", color='#6366F1')
            bars2 = ax2.bar([i + width/2 for i in x2], v2_values, width, 
                           label=f"v{data['version_compared']}", color='#8B5CF6')
            
            ax2.set_ylabel('Monto ($)', fontsize=10)
            ax2.set_title('Aportación por Componente', fontsize=12, fontweight='bold')
            ax2.set_xticks(x2)
            ax2.set_xticklabels(component_names, rotation=45, ha='right')
            ax2.legend()
            ax2.grid(axis='y', alpha=0.3)
            
            # Formatear eje Y
            ax2.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:,.0f}'))
            
            plt.tight_layout()
            
            buffer2 = io.BytesIO()
            plt.savefig(buffer2, format='png', dpi=150, bbox_inches='tight')
            buffer2.seek(0)
            charts['components'] = f"data:image/png;base64,{base64.b64encode(buffer2.read()).decode()}"
            plt.close(fig2)
    
    except Exception as e:
        print(f"⚠️ Error generando gráficos: {e}")
        charts['revenue_profit'] = None
        charts['components'] = None
    
    return charts


def prepare_report_data(q1: Dict, q2: Dict, df1, df2, narrative: Dict, 
                        playbook_name: str, playbook_config: Dict) -> Dict[str, Any]:
    """
    Prepara datos estructurados para el reporte PDF.
    Esta función NO calcula. Solo estructura.
    
    Args:
        q1: Quote versión 1
        q2: Quote versión 2
        df1: DataFrame líneas v1
        df2: DataFrame líneas v2
        narrative: Narrativa ya generada
        playbook_name: Nombre del playbook
        playbook_config: Configuración del playbook
    
    Returns:
        Dict con todos los datos estructurados para el template
    """
    
    # Calcular deltas para formato
    delta_revenue = float(q2['total_revenue']) - float(q1['total_revenue'])
    delta_profit = float(q2['gross_profit']) - float(q1['gross_profit'])
    delta_margin = float(q2['avg_margin']) - float(q1['avg_margin'])
    delta_cost = float(q2['total_cost']) - float(q1['total_cost'])
    
    # Determinar clases CSS para deltas
    def get_delta_class(value, inverse=False):
        if value > 0:
            return 'negative' if inverse else 'positive'
        elif value < 0:
            return 'positive' if inverse else 'negative'
        return 'neutral'
    
    def format_delta(value, is_money=True, is_percent=False):
        sign = '+' if value >= 0 else ''
        if is_money:
            return f"{sign}${abs(value):,.2f}"
        elif is_percent:
            return f"{sign}{value:.2f}pp"
        else:
            return f"{sign}{value:,.2f}"
    
    # Componentes por service_origin
    components_data = []
    if df1 is not None and df2 is not None and len(df1) > 0 and len(df2) > 0:
        comp1 = df1.groupby("service_origin")["final_price_unit"].sum()
        comp2 = df2.groupby("service_origin")["final_price_unit"].sum()
        
        all_components = set(comp1.index) | set(comp2.index)
        for comp in all_components:
            v1_val = comp1.get(comp, 0)
            v2_val = comp2.get(comp, 0)
            delta_comp = v2_val - v1_val
            
            components_data.append({
                'name': comp,
                'v1': v1_val,
                'v2': v2_val,
                'delta': delta_comp,
                'delta_text': format_delta(delta_comp),
                'delta_class': get_delta_class(delta_comp)
            })
    
    # Contar líneas en riesgo
    red_lines_v1 = 0
    red_lines_v2 = 0
    if df1 is not None and len(df1) > 0:
        red_lines_v1 = (df1["margin_pct"] < playbook_config.get("yellow", 20)).sum()
    if df2 is not None and len(df2) > 0:
        red_lines_v2 = (df2["margin_pct"] < playbook_config.get("yellow", 20)).sum()
    
    # Detalle de riesgo
    risk_details = None
    if red_lines_v2 > 0:
        risk_details = f"La versión v{int(q2['version'])} presenta {red_lines_v2} línea(s) con margen crítico (< {playbook_config.get('yellow', 20)}%)."
        if len(components_data) > 0:
            # Identificar componente con más riesgo
            risk_comp = max(components_data, key=lambda x: abs(x['delta']) if x['delta'] < 0 else 0)
            risk_details += f" El riesgo se concentra principalmente en el componente '{risk_comp['name']}'."
    
    # Benchmark text
    margin_v2 = float(q2['avg_margin'])
    green_threshold = playbook_config.get('green', 35)
    yellow_threshold = playbook_config.get('yellow', 25)
    
    if margin_v2 >= green_threshold:
        benchmark_text = f"El margen promedio de {margin_v2:.1f}% supera el benchmark verde del playbook {playbook_name} ({green_threshold}%), indicando una estructura financiera sólida y sostenible."
    elif margin_v2 >= yellow_threshold:
        gap = green_threshold - margin_v2
        benchmark_text = f"El margen promedio de {margin_v2:.1f}% se encuentra {gap:.1f} puntos porcentuales por debajo del benchmark verde, pero dentro del rango aceptable del playbook {playbook_name}."
    else:
        gap = yellow_threshold - margin_v2
        benchmark_text = f"El margen promedio de {margin_v2:.1f}% está {gap:.1f} puntos porcentuales por debajo del umbral mínimo, requiriendo revisión estructural según criterios del playbook {playbook_name}."
    
    # Estructura de datos completa
    data = {
        'quote_group': q1.get('quote_group_id', 'N/A'),
        'version_base': int(q1['version']),
        'version_compared': int(q2['version']),
        'generated_date': datetime.now().strftime('%d de %B, %Y'),
        'report_id': str(uuid.uuid4())[:8].upper(),
        
        'operation_type': 'Operación comercial mixta (productos y servicios)',
        'commercial_intent': 'Optimización financiera y ajuste de alcance comercial',
        
        'playbook': {
            'name': playbook_name,
            'description': playbook_config.get('description', ''),
            'green': playbook_config.get('green', 35),
            'yellow': playbook_config.get('yellow', 25),
            'benchmark_text': benchmark_text
        },
        
        'metrics': {
            'revenue_v1': float(q1['total_revenue']),
            'revenue_v2': float(q2['total_revenue']),
            'cost_v1': float(q1['total_cost']),
            'cost_v2': float(q2['total_cost']),
            'profit_v1': float(q1['gross_profit']),
            'profit_v2': float(q2['gross_profit']),
            'margin_v1': f"{float(q1['avg_margin']):.2f}",
            'margin_v2': f"{float(q2['avg_margin']):.2f}",
            
            'delta_revenue': delta_revenue,
            'delta_revenue_text': format_delta(delta_revenue),
            'delta_revenue_class': get_delta_class(delta_revenue),
            
            'delta_cost': delta_cost,
            'delta_cost_text': format_delta(delta_cost),
            'delta_cost_class': get_delta_class(delta_cost, inverse=True),
            
            'delta_profit': delta_profit,
            'delta_profit_text': format_delta(delta_profit),
            'delta_profit_class': get_delta_class(delta_profit),
            
            'delta_margin': delta_margin,
            'delta_margin_text': format_delta(delta_margin, is_money=False, is_percent=True),
            'delta_margin_class': get_delta_class(delta_margin),
        },
        
        'health': {
            'v1': narrative.get('health_v1', 'amarillo'),
            'v2': narrative.get('health_v2', 'amarillo'),
            'red_lines_v1': int(red_lines_v1),
            'red_lines_v2': int(red_lines_v2),
            'risk_details': risk_details
        },
        
        'components': components_data,
        
        'narrative': {
            'executive': narrative.get('executive', ''),
            'detail': narrative.get('detail', '')
        },
        
        'recommendation': {
            'title': f"Versión Recomendada: v{int(q2['version']) if narrative.get('score_v2', 0) > narrative.get('score_v1', 0) else int(q1['version'])}",
            'text': narrative.get('executive', '').split('✅')[1].strip() if '✅' in narrative.get('executive', '') else narrative.get('executive', ''),
            'score_v1': f"{narrative.get('score_v1', 0):.1f}",
            'score_v2': f"{narrative.get('score_v2', 0):.1f}",
            'main_reason': 'Mejor balance entre salud financiera, margen promedio y sostenibilidad operativa según criterios del playbook aplicado.',
            'tradeoff': None
        }
    }
    
    # Agregar tradeoff si aplica
    if abs(delta_margin) > 5:
        if delta_revenue > 0 and delta_margin < 0:
            data['recommendation']['tradeoff'] = f"Aunque la versión v{int(q2['version'])} incrementa el ingreso en ${abs(delta_revenue):,.2f}, reduce el margen en {abs(delta_margin):.2f} puntos porcentuales. Evaluar si el volumen adicional justifica la compresión de margen."
        elif delta_revenue < 0 and delta_margin > 0:
            data['recommendation']['tradeoff'] = f"La versión v{int(q2['version'])} mejora el margen en {abs(delta_margin):.2f} puntos porcentuales a costa de reducir el ingreso en ${abs(delta_revenue):,.2f}. Evaluar prioridad entre rentabilidad y volumen."
    
    return data


def generate_pdf_report(data: Dict[str, Any], branding: Optional[Dict[str, str]] = None) -> bytes:
    """
    Genera PDF ejecutivo a partir de datos estructurados.
    
    Args:
        data: Datos completos del reporte (preparados con prepare_report_data)
        branding: Configuración de marca (logo, colores, nombre)
    
    Returns:
        bytes del PDF generado
    """
    
    if not WEASYPRINT_AVAILABLE:
        raise ImportError("WeasyPrint no está instalado. Ejecutar: pip install weasyprint")
    
    # Branding por defecto
    if branding is None:
        branding = {
            'logo_url': None,
            'primary_color': '#4F46E5',
            'secondary_color': '#F59E0B',
            'company_name': 'DynamiQuote'
        }
    
    # Generar gráficos
    charts = generate_comparison_charts(data)
    
    # Cargar template HTML
    template_path = os.path.join(os.path.dirname(__file__), 'templates', 'report_template.html')
    with open(template_path, 'r', encoding='utf-8') as f:
        template_content = f.read()
    
    # Cargar estilos CSS
    styles_path = os.path.join(os.path.dirname(__file__), 'templates', 'styles.css')
    with open(styles_path, 'r', encoding='utf-8') as f:
        styles_content = f.read()
    
    # Renderizar template con Jinja2
    template = Template(template_content)
    template.globals['format_money'] = format_money
    
    html_content = template.render(
        data=data,
        branding=branding,
        charts=charts,
        styles=styles_content
    )
    
    # Generar PDF con WeasyPrint
    pdf_bytes = HTML(string=html_content).write_pdf()
    
    return pdf_bytes


if __name__ == "__main__":
    # Test básico
    print("✅ Módulo pdf_generator cargado correctamente")
    print(f"   WeasyPrint disponible: {WEASYPRINT_AVAILABLE}")
