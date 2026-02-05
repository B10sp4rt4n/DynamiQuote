"""
Backend FastAPI para DynamiQuote
Expone endpoints para calcular rentabilidad de items.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import sys
import os

# Agregar path para imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from src.api.models import (
    BatchCalculateRequest,
    BatchCalculateResponse,
    ItemNode,
    PlaybookInfo,
    PlaybooksResponse
)
from src.domain.profitability_calculator import ProfitabilityCalculator
from src.config.playbooks import PLAYBOOKS, get_playbook_names

# Inicializar FastAPI
app = FastAPI(
    title="DynamiQuote API",
    description="API para cálculo de rentabilidad de cotizaciones",
    version="1.0.0"
)

# Configurar CORS para desarrollo (ajustar en producción)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8501"],  # Streamlit default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "DynamiQuote API",
        "version": "1.0.0"
    }


@app.get("/playbooks", response_model=PlaybooksResponse)
def get_playbooks():
    """
    Obtiene todos los playbooks disponibles con sus configuraciones.
    """
    playbook_list = []
    for name in get_playbook_names():
        pb = PLAYBOOKS[name]
        playbook_list.append(PlaybookInfo(
            name=name,
            description=pb["description"],
            green_threshold=pb["green"],
            yellow_threshold=pb["yellow"],
            red_threshold=pb["red"],
            max_red_for_green=pb["max_red_green"],
            max_red_for_yellow=pb["max_red_yellow"],
            weights=pb["weights"]
        ))
    
    return PlaybooksResponse(
        playbooks=playbook_list,
        total=len(playbook_list)
    )


@app.post("/calculate/batch", response_model=BatchCalculateResponse)
def calculate_batch(request: BatchCalculateRequest):
    """
    Calcula nodos de rentabilidad para múltiples items en batch.
    
    Optimización crítica para evitar N+1 HTTP calls:
    - Frontend envía 100 líneas en una sola request
    - Backend procesa batch y retorna 100 nodos calculados
    - Reduce latencia de ~10 segundos a <200ms
    
    Args:
        request: BatchCalculateRequest con items y playbook
        
    Returns:
        BatchCalculateResponse con nodos calculados
        
    Raises:
        HTTPException 400: Si hay errores de validación
        HTTPException 500: Si falla el cálculo
    """
    try:
        # Convertir ItemInput a dict para ProfitabilityCalculator
        items_dict = [item.model_dump() for item in request.items]
        
        # Calcular nodos usando servicio de dominio
        calculated_nodes = ProfitabilityCalculator.calculate_batch(
            items_dict,
            request.playbook_name
        )
        
        # Convertir a modelos Pydantic
        nodes = [ItemNode(**node) for node in calculated_nodes]
        
        return BatchCalculateResponse(
            nodes=nodes,
            total_items=len(nodes),
            playbook_used=request.playbook_name
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Error de validación: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en cálculo: {str(e)}")


@app.post("/calculate/single", response_model=ItemNode)
def calculate_single(request: BatchCalculateRequest):
    """
    Calcula un único item (wrapper sobre endpoint batch).
    Útil para previsualización en tiempo real.
    
    Args:
        request: BatchCalculateRequest con un solo item
        
    Returns:
        ItemNode calculado
    """
    if len(request.items) != 1:
        raise HTTPException(
            status_code=400, 
            detail="Este endpoint requiere exactamente 1 item. Usa /calculate/batch para múltiples items."
        )
    
    result = calculate_batch(request)
    return result.nodes[0]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Hot reload en desarrollo
        log_level="info"
    )
