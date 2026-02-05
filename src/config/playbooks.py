"""
Configuración de Playbooks - Estrategias de Cotización
Extraído de app.py para centralizar configuración de dominio.
"""

from typing import Dict, Any

PLAYBOOKS: Dict[str, Dict[str, Any]] = {
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


def get_playbook(playbook_name: str) -> Dict[str, Any]:
    """Obtiene un playbook por nombre, con fallback a General."""
    return PLAYBOOKS.get(playbook_name, PLAYBOOKS["General"])


def get_playbook_names() -> list[str]:
    """Retorna lista de nombres de playbooks disponibles."""
    return list(PLAYBOOKS.keys())
