"""
Paquete de configuración de DynamiQuote.
Contiene configuraciones de dominio como PLAYBOOKS.
"""

from src.config.playbooks import PLAYBOOKS, get_playbook, get_playbook_names

__all__ = ["PLAYBOOKS", "get_playbook", "get_playbook_names"]
