"""
Visualización de la Arquitectura Propuesta para DynamiQuote
Muestra la estructura modular usando Clean Architecture + DDD
"""

import matplotlib.pyplot as plt
import networkx as nx

# Crear grafo dirigido
G = nx.DiGraph()

# ============================================
# DEFINIR NODOS POR CAPAS
# ============================================

# CAPA DE PRESENTACIÓN (UI)
presentation_nodes = [
    "Presentation Layer",
    "streamlit_app.py",
    "comparador_page",
    "motor_aup_page",
    "legacy_quoter_page",
    "formal_proposals_page",
    "components",
]

# CAPA DE APLICACIÓN (Use Cases)
application_nodes = [
    "Application Layer",
    "create_proposal_uc",
    "add_item_uc",
    "close_proposal_uc",
    "import_excel_uc",
    "compare_quotes_uc",
    "generate_report_uc",
]

# CAPA DE DOMINIO (Business Logic)
domain_nodes = [
    "Domain Layer",
    "Proposal (Entity)",
    "Quote (Entity)",
    "QuoteLine (Entity)",
    "Money (VO)",
    "Margin (VO)",
    "HealthStatus (VO)",
    "ProfitabilityCalculator",
    "HealthEvaluator",
    "VersionComparator",
    "PricingStrategy",
]

# CAPA DE INFRAESTRUCTURA (Implementaciones)
infrastructure_nodes = [
    "Infrastructure Layer",
    "ProposalRepository",
    "QuoteRepository",
    "PostgreSQLConnection",
    "ExcelParserImpl",
    "OpenAIService",
    "PDFGenerator",
]

# Agregar todos los nodos
G.add_nodes_from(presentation_nodes)
G.add_nodes_from(application_nodes)
G.add_nodes_from(domain_nodes)
G.add_nodes_from(infrastructure_nodes)

# ============================================
# DEFINIR RELACIONES (EDGES)
# ============================================

# Presentación → Application
presentation_to_app = [
    ("streamlit_app.py", "Presentation Layer"),
    ("Presentation Layer", "create_proposal_uc", "usa"),
    ("Presentation Layer", "compare_quotes_uc", "usa"),
    ("comparador_page", "compare_quotes_uc", "llama"),
    ("motor_aup_page", "create_proposal_uc", "llama"),
    ("motor_aup_page", "add_item_uc", "llama"),
    ("legacy_quoter_page", "generate_report_uc", "llama"),
    ("formal_proposals_page", "generate_report_uc", "llama"),
]

# Application → Domain (Dependency)
app_to_domain = [
    ("Application Layer", "Domain Layer", "depende"),
    ("create_proposal_uc", "Proposal (Entity)", "crea"),
    ("add_item_uc", "QuoteLine (Entity)", "crea"),
    ("close_proposal_uc", "Proposal (Entity)", "modifica"),
    ("import_excel_uc", "ProfitabilityCalculator", "usa"),
    ("compare_quotes_uc", "VersionComparator", "usa"),
    ("create_proposal_uc", "PricingStrategy", "aplica"),
    ("compare_quotes_uc", "HealthEvaluator", "usa"),
]

# Application → Infrastructure (Dependency Inversion)
app_to_infra = [
    ("Application Layer", "Infrastructure Layer", "invierte"),
    ("create_proposal_uc", "ProposalRepository", "requiere"),
    ("add_item_uc", "ProposalRepository", "requiere"),
    ("close_proposal_uc", "ProposalRepository", "requiere"),
    ("import_excel_uc", "ExcelParserImpl", "requiere"),
    ("generate_report_uc", "PDFGenerator", "requiere"),
    ("compare_quotes_uc", "QuoteRepository", "requiere"),
]

# Infrastructure → Domain (Implementa entidades)
infra_to_domain = [
    ("ProposalRepository", "Proposal (Entity)", "persiste"),
    ("QuoteRepository", "Quote (Entity)", "persiste"),
    ("QuoteRepository", "QuoteLine (Entity)", "persiste"),
]

# Domain internals
domain_internals = [
    ("Proposal (Entity)", "Money (VO)", "contiene"),
    ("QuoteLine (Entity)", "Margin (VO)", "contiene"),
    ("ProfitabilityCalculator", "Margin (VO)", "calcula"),
    ("HealthEvaluator", "HealthStatus (VO)", "evalúa"),
    ("PricingStrategy", "Money (VO)", "determina"),
]

# Agregar todas las relaciones
for edge in presentation_to_app:
    if len(edge) == 3:
        G.add_edge(edge[0], edge[1], relationship=edge[2])
    else:
        G.add_edge(edge[0], edge[1])

for edge in app_to_domain:
    G.add_edge(edge[0], edge[1], relationship=edge[2])

for edge in app_to_infra:
    G.add_edge(edge[0], edge[1], relationship=edge[2])

for edge in infra_to_domain:
    G.add_edge(edge[0], edge[1], relationship=edge[2])

for edge in domain_internals:
    G.add_edge(edge[0], edge[1], relationship=edge[2])

# ============================================
# CONFIGURACIÓN DE COLORES Y POSICIONES
# ============================================

# Colores por capa (Clean Architecture)
colors = {}
for node in presentation_nodes:
    colors[node] = "#FFE4B5"  # Moccasin - Presentation
for node in application_nodes:
    colors[node] = "#FFB6C1"  # LightPink - Application
for node in domain_nodes:
    colors[node] = "#87CEEB"  # SkyBlue - Domain (Core)
for node in infrastructure_nodes:
    colors[node] = "#90EE90"  # LightGreen - Infrastructure

# Posiciones en layout jerárquico (de arriba hacia abajo)
pos = {}

# Layer headers (centrados en cada columna)
pos["Presentation Layer"] = (0, 4)
pos["Application Layer"] = (0, 3)
pos["Domain Layer"] = (0, 2)
pos["Infrastructure Layer"] = (0, 1)

# Presentation nodes (fila superior)
y_pres = 4.5
pos["streamlit_app.py"] = (-3, y_pres)
pos["comparador_page"] = (-2, y_pres - 0.3)
pos["motor_aup_page"] = (-1, y_pres - 0.3)
pos["legacy_quoter_page"] = (1, y_pres - 0.3)
pos["formal_proposals_page"] = (2, y_pres - 0.3)
pos["components"] = (3, y_pres)

# Application nodes (segunda fila)
y_app = 3
pos["create_proposal_uc"] = (-2.5, y_app - 0.3)
pos["add_item_uc"] = (-1.5, y_app - 0.3)
pos["close_proposal_uc"] = (-0.5, y_app - 0.3)
pos["import_excel_uc"] = (0.5, y_app - 0.3)
pos["compare_quotes_uc"] = (1.5, y_app - 0.3)
pos["generate_report_uc"] = (2.5, y_app - 0.3)

# Domain nodes (core - tercera fila)
y_domain = 2
pos["Proposal (Entity)"] = (-3, y_domain - 0.3)
pos["Quote (Entity)"] = (-2, y_domain - 0.3)
pos["QuoteLine (Entity)"] = (-1, y_domain - 0.3)
pos["Money (VO)"] = (0, y_domain - 0.6)
pos["Margin (VO)"] = (1, y_domain - 0.6)
pos["HealthStatus (VO)"] = (2, y_domain - 0.6)
pos["ProfitabilityCalculator"] = (-2.5, y_domain - 1)
pos["HealthEvaluator"] = (-1, y_domain - 1)
pos["VersionComparator"] = (0.5, y_domain - 1)
pos["PricingStrategy"] = (2, y_domain - 1)

# Infrastructure nodes (cuarta fila)
y_infra = 1
pos["ProposalRepository"] = (-2.5, y_infra - 0.3)
pos["QuoteRepository"] = (-1, y_infra - 0.3)
pos["PostgreSQLConnection"] = (0.5, y_infra - 0.3)
pos["ExcelParserImpl"] = (1.5, y_infra - 0.3)
pos["OpenAIService"] = (2.5, y_infra - 0.3)
pos["PDFGenerator"] = (3.5, y_infra - 0.3)

# ============================================
# RENDERIZAR GRAFO
# ============================================

plt.figure(figsize=(18, 12))
plt.title("Arquitectura Modular Propuesta - DynamiQuote\nClean Architecture + Domain-Driven Design", 
          fontsize=16, fontweight='bold', pad=20)

# Dibujar nodos
nx.draw_networkx_nodes(G, pos, 
                       node_color=[colors[node] for node in G.nodes()],
                       node_size=3000,
                       alpha=0.9,
                       edgecolors='black',
                       linewidths=2)

# Dibujar etiquetas de nodos
nx.draw_networkx_labels(G, pos, 
                        font_size=8, 
                        font_weight='bold',
                        font_family='sans-serif')

# Dibujar edges con diferentes estilos
edge_colors = []
edge_styles = []
for edge in G.edges():
    relationship = G[edge[0]][edge[1]].get('relationship', '')
    if relationship in ['depende', 'invierte']:
        edge_colors.append('red')
        edge_styles.append('dashed')
    elif relationship in ['usa', 'llama', 'requiere']:
        edge_colors.append('blue')
        edge_styles.append('solid')
    else:
        edge_colors.append('gray')
        edge_styles.append('dotted')

nx.draw_networkx_edges(G, pos,
                       edge_color=edge_colors,
                       style=edge_styles,
                       width=1.5,
                       alpha=0.6,
                       arrows=True,
                       arrowsize=15,
                       arrowstyle='->')

# Dibujar etiquetas de edges
edge_labels = nx.get_edge_attributes(G, 'relationship')
nx.draw_networkx_edge_labels(G, pos, edge_labels, 
                             font_size=6,
                             font_color='darkred',
                             bbox=dict(boxstyle='round,pad=0.3', facecolor='white', alpha=0.7))

# Leyenda
legend_elements = [
    plt.Line2D([0], [0], marker='o', color='w', markerfacecolor='#FFE4B5', 
               markersize=15, label='Presentation Layer (UI)', markeredgecolor='black', markeredgewidth=2),
    plt.Line2D([0], [0], marker='o', color='w', markerfacecolor='#FFB6C1', 
               markersize=15, label='Application Layer (Use Cases)', markeredgecolor='black', markeredgewidth=2),
    plt.Line2D([0], [0], marker='o', color='w', markerfacecolor='#87CEEB', 
               markersize=15, label='Domain Layer (Business Logic)', markeredgecolor='black', markeredgewidth=2),
    plt.Line2D([0], [0], marker='o', color='w', markerfacecolor='#90EE90', 
               markersize=15, label='Infrastructure Layer (External)', markeredgecolor='black', markeredgewidth=2),
    plt.Line2D([0], [0], color='blue', linewidth=2, label='Llama/Usa'),
    plt.Line2D([0], [0], color='red', linewidth=2, linestyle='dashed', label='Depende/Invierte'),
    plt.Line2D([0], [0], color='gray', linewidth=2, linestyle='dotted', label='Relaciones internas'),
]
plt.legend(handles=legend_elements, loc='upper left', fontsize=10, framealpha=0.9)

# Anotaciones explicativas
plt.text(-3.5, 5.2, "🎨 UI & Components", fontsize=11, fontweight='bold', color='#8B4513')
plt.text(-3.5, 3.7, "🎯 Use Cases (Orchestration)", fontsize=11, fontweight='bold', color='#C71585')
plt.text(-3.5, 2.7, "💎 Core Business (Pure Logic)", fontsize=11, fontweight='bold', color='#4682B4')
plt.text(-3.5, 1.7, "🔧 External Services & DB", fontsize=11, fontweight='bold', color='#228B22')

plt.axis('off')
plt.tight_layout()
plt.savefig('architecture_diagram.png', dpi=300, bbox_inches='tight', facecolor='white')
print("\n✅ Diagrama generado: architecture_diagram.png")
print("📊 Visualización de arquitectura modular propuesta")
print(f"📦 Nodos totales: {G.number_of_nodes()}")
print(f"🔗 Relaciones totales: {G.number_of_edges()}")
print("\nCapas:")
print(f"  - Presentation: {len(presentation_nodes)} módulos")
print(f"  - Application: {len(application_nodes)} use cases")
print(f"  - Domain: {len(domain_nodes)} componentes core")
print(f"  - Infrastructure: {len(infrastructure_nodes)} servicios")
plt.show()
