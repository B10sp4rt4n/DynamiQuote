# 🔄 Análisis: Arquitectura API-First vs Refactor In-Place

**Fecha:** 5 de Febrero, 2026  
**Contexto:** Reconsideración de estrategia de refactorización bajo paradigma API-First  
**Autor:** GitHub Copilot  

---

## 📋 Resumen Ejecutivo

Este documento analiza **dos caminos distintos** para refactorizar DynamiQuote:

| Enfoque | Descripción | Tiempo | Complejidad | Escalabilidad |
|---------|-------------|--------|-------------|---------------|
| **Refactor In-Place** | Clean Architecture dentro de Streamlit monolítico | 8-10 sem | Media | Limitada |
| **API-First** | Backend FastAPI + Streamlit como terminal tonta | 8-11 sem | Alta | Excelente |
| **Híbrido (Recomendado)** | Refactor → Extract API gradualmente | 10-13 sem | Media-Alta | Excelente |

**Recomendación:** **Plan Híbrido** - refactorizar primero, extraer API después.

---

## 🏗️ Arquitectura API-First: Visión Completa

### **Componentes del Sistema:**

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENTE (Browser)                         │
│                  Streamlit UI (Terminal Tonta)               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │ Comparador │  │ Motor AUP  │  │  Propuestas│            │
│  │   Page     │  │    Page    │  │    Page    │            │
│  └────────────┘  └────────────┘  └────────────┘            │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP/JSON
                      │ (requests library)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND API (FastAPI)                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Application Layer (Use Cases)             │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │ │
│  │  │CreateProposal│  │CalculatePrice│  │CompareQuotes │ │ │
│  │  │   UC         │  │    UC        │  │   UC         │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Domain Layer (Business Logic)             │ │
│  │  ┌──────────────────────────────────────────────────┐ │ │
│  │  │ ProfitabilityCalculator | HealthEvaluator       │ │ │
│  │  │ PricingStrategy | VersionComparator              │ │ │
│  │  └──────────────────────────────────────────────────┘ │ │
│  │  ┌──────────────────────────────────────────────────┐ │ │
│  │  │ Entities: Proposal, Quote, QuoteLine             │ │ │
│  │  │ Value Objects: Money, Margin, HealthStatus       │ │ │
│  │  └──────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Infrastructure Layer (External Services)       │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │ │
│  │  │  PostgreSQL  │  │   OpenAI     │  │    Redis     │ │ │
│  │  │  Repository  │  │   Service    │  │   Cache      │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                     DATABASE (Neon PostgreSQL)               │
│         Tables: proposals, quotes, quote_lines, etc.         │
└─────────────────────────────────────────────────────────────┘
```

### **Flujo de Datos Típico:**

1. **Usuario** ingresa datos en Streamlit (costo, margen, cantidad)
2. **Streamlit** envía HTTP POST a API: `POST /calculate_prices_batch`
3. **FastAPI** recibe request, valida con Pydantic
4. **Use Case** orquesta domain services
5. **Domain Services** calculan nodos de rentabilidad
6. **API** retorna JSON con resultados calculados
7. **Streamlit** renderiza resultados en UI

**Latencia típica:** 50-200ms por request

---

## 🔴 Nuevo Top 5 Retos Complejos (API-First)

### **Comparación de Retos:**

| # | Reto Refactor In-Place | Reto API-First | ¿Más Complejo? |
|---|------------------------|----------------|----------------|
| 1 | Precisión Decimal en Value Objects | **Latencia HTTP (N+1 Problem)** | 🔴 Sí |
| 2 | Migrar calculate_item_node() | **Precisión Decimal + JSON** | 🟡 Similar |
| 3 | session_state Streamlit | **Estado Distribuido** | 🔴 Sí |
| 4 | Serialización PostgreSQL | **Auth + Multitenancy** | 🟡 Similar |
| 5 | DynamicSwitch + Playbooks | **Testing E2E Distribuido** | 🔴 Sí |

---

## 🔴 RETO #1: Latencia y Performance (N+1 HTTP Problem)

### **Problema:**

Con 100 líneas de cotización, el approach naive requiere 100 HTTP requests individuales.

```python
# ❌ ANTI-PATTERN: N+1 HTTP Requests
import streamlit as st
import requests

API_URL = "http://api:8000/calculate_price"
lines = st.session_state.lines  # 100 líneas

results = []
for line in lines:  # ← Loop de 100 iteraciones
    response = requests.post(
        API_URL,
        json={
            "cost": line["cost"],
            "margin": line["margin"],
            "quantity": line["quantity"]
        }
    )
    result = response.json()
    results.append(result)

# Tiempo total:
# 100 requests × 50ms latencia promedio = 5 segundos ❌
# UX inaceptable para usuario
```

### **Solución: Batch API Endpoint**

```python
# ✅ Backend API con endpoint batch
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
from decimal import Decimal

app = FastAPI()

class LineItem(BaseModel):
    id: str
    cost: Decimal
    margin: Decimal
    quantity: Decimal

class BatchRequest(BaseModel):
    items: List[LineItem]

class BatchResponse(BaseModel):
    results: List[dict]

@app.post("/calculate_prices_batch", response_model=BatchResponse)
async def calculate_prices_batch(request: BatchRequest):
    """
    Calcula TODOS los precios en una sola llamada HTTP.
    Procesa 100-1000 items en <200ms.
    """
    from domain.services import ProfitabilityCalculator
    
    results = []
    for item in request.items:
        # Cálculo usando domain service
        node = ProfitabilityCalculator.calculate_node_dict({
            "cost_unit": str(item.cost),
            "margin": str(item.margin),
            "quantity": str(item.quantity)
        })
        
        results.append({
            "id": item.id,
            "final_price": node["final_price_unit"],
            "margin_pct": node["margin_pct"],
            "health": node["health"]
        })
    
    return BatchResponse(results=results)
```

```python
# ✅ Frontend Streamlit optimizado
import streamlit as st
import requests

API_URL = "http://api:8000/calculate_prices_batch"

# Una ÚNICA llamada HTTP para TODAS las líneas
response = requests.post(
    API_URL,
    json={
        "items": [
            {
                "id": line["id"],
                "cost": str(line["cost"]),
                "margin": str(line["margin"]),
                "quantity": str(line["quantity"])
            }
            for line in st.session_state.lines
        ]
    }
)

# Procesar resultados
results = response.json()["results"]

# Tiempo total: 1 request × 150ms = 150ms ✅
# 33x más rápido que approach individual
```

### **Optimizaciones Adicionales:**

**1. Caching en Backend con Redis:**

```python
# Backend con cache
import redis
import json
from functools import lru_cache

redis_client = redis.Redis(host='localhost', port=6379, db=0)

@app.post("/calculate_prices_batch")
async def calculate_prices_batch(request: BatchRequest):
    results = []
    
    for item in request.items:
        # Generar cache key
        cache_key = f"price:{item.cost}:{item.margin}:{item.quantity}"
        
        # Intentar leer de cache
        cached = redis_client.get(cache_key)
        if cached:
            result = json.loads(cached)
        else:
            # Calcular si no está en cache
            result = ProfitabilityCalculator.calculate_node_dict(item.dict())
            
            # Guardar en cache (expire 1 hora)
            redis_client.setex(cache_key, 3600, json.dumps(result))
        
        results.append(result)
    
    return BatchResponse(results=results)
```

**2. Async Processing:**

```python
# Backend async para I/O bound operations
import asyncio
from concurrent.futures import ThreadPoolExecutor

executor = ThreadPoolExecutor(max_workers=10)

@app.post("/calculate_prices_batch")
async def calculate_prices_batch(request: BatchRequest):
    """Procesa items en paralelo."""
    
    async def calculate_single(item):
        # Offload cálculo intensivo a thread pool
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            executor,
            ProfitabilityCalculator.calculate_node_dict,
            item.dict()
        )
    
    # Procesar todos en paralelo
    results = await asyncio.gather(*[
        calculate_single(item) for item in request.items
    ])
    
    return BatchResponse(results=results)
```

### **Benchmarks Esperados:**

| Escenario | Sin Optimización | Con Batch | Con Cache | Con Async |
|-----------|-----------------|-----------|-----------|-----------|
| 10 líneas | 500ms | 50ms | 5ms | 30ms |
| 100 líneas | 5000ms | 150ms | 20ms | 80ms |
| 1000 líneas | 50000ms | 1500ms | 100ms | 600ms |

### **Criterios de Éxito:**
- ✅ Cálculo de 100 líneas en <200ms (p95)
- ✅ Throughput API: >500 req/s
- ✅ Cache hit rate: >80% en producción
- ✅ CPU utilization: <50% en promedio

**Tiempo Estimado:** 1 semana  
**Riesgo:** 🔴 CRÍTICO - Performance inaceptable rompe UX

---

## 🔴 RETO #2: Precisión Decimal en JSON/HTTP

### **Problema: JSON no soporta Decimal nativamente**

```python
# ❌ PROBLEMA: JSON pierde precisión
from decimal import Decimal
import json

# Backend calcula con precisión
price = Decimal("1234567.89123456")

# Serializar a JSON
json_str = json.dumps({"price": price})
# TypeError: Object of type Decimal is not JSON serializable

# Workaround naive:
json_str = json.dumps({"price": float(price)})
# '{"price": 1234567.8912345599}'  ← ❌ Cambió el último dígito!

# Frontend deserializa
data = json.loads(json_str)
received_price = Decimal(str(data["price"]))
# Decimal('1234567.8912345599')  ← ❌ NO es igual al original
```

### **Solución: Pydantic + String Serialization**

```python
# ✅ Backend FastAPI con Pydantic
from pydantic import BaseModel, Field
from decimal import Decimal
from typing import List

class PriceResponse(BaseModel):
    final_price: Decimal = Field(..., description="Precio final exacto")
    margin_pct: Decimal
    
    class Config:
        # Configurar Pydantic para serializar Decimal como string
        json_encoders = {
            Decimal: lambda v: str(v)  # "1234567.89123456"
        }

@app.post("/calculate_price", response_model=PriceResponse)
async def calculate_price(cost: Decimal, margin: Decimal):
    final_price = cost * (Decimal("1") + margin)
    margin_pct = margin * 100
    
    return PriceResponse(
        final_price=final_price,
        margin_pct=margin_pct
    )

# Response JSON:
# {
#   "final_price": "1234567.89123456",  ← String preserva precisión
#   "margin_pct": "15.00000000"
# }
```

```python
# ✅ Frontend Streamlit
import streamlit as st
import requests
from decimal import Decimal

# Enviar datos como strings
response = requests.post(
    "http://api:8000/calculate_price",
    params={
        "cost": "1234567.89123456",  # ✅ String, no float
        "margin": "0.15"
    }
)

# Recibir y reconstruir Decimal
data = response.json()
final_price = Decimal(data["final_price"])  # ✅ Precisión preservada

st.write(f"Precio final: ${final_price}")
# Muestra: $1421252.07591777  ← EXACTO
```

### **Validación de Roundtrip:**

```python
# Test de precisión E2E
def test_decimal_precision_http_roundtrip():
    """Validar que Decimal sobrevive HTTP."""
    original = Decimal("999999999.999999999")
    
    # Enviar a API
    response = requests.post(
        "http://api:8000/echo_decimal",
        json={"value": str(original)}
    )
    
    # Recibir de API
    received = Decimal(response.json()["value"])
    
    # Validar identidad exacta
    assert received == original
    assert str(received) == str(original)
    
    # Validar que NO es float
    assert type(received) == Decimal
```

### **Edge Cases a Manejar:**

```python
# Edge case 1: Infinity
inf_value = Decimal("Infinity")
json_safe = str(inf_value)  # "Infinity"
# Backend debe rechazar: raise ValueError("Infinite values not allowed")

# Edge case 2: NaN
nan_value = Decimal("NaN")
json_safe = str(nan_value)  # "NaN"
# Backend debe rechazar: raise ValueError("NaN not allowed")

# Edge case 3: Valores muy pequeños
tiny = Decimal("0.00000000000001")
# Mantener precisión: "0.00000000000001" ✅

# Edge case 4: Números negativos
negative = Decimal("-123.456")
# Mantener signo: "-123.456" ✅
```

**Criterios de Éxito:**
- ✅ 0 pérdida de precisión en 1,000,000 roundtrips
- ✅ Todos los edge cases manejados correctamente
- ✅ Performance: <1ms overhead por serialización

**Tiempo Estimado:** 3-5 días  
**Riesgo:** 🔴 CRÍTICO - Errores financieros silenciosos

---

## 🔴 RETO #3: Manejo de Estado Distribuido

### **Problema: Estado en Streamlit vs Backend**

En arquitectura monolítica, `st.session_state` almacena todo:
- Líneas de cotización
- Resultados calculados
- UI state (colapsados, tabs activos)

**Con API-First, decisión crítica: ¿Dónde vive el estado?**

### **Opción 1: Stateless API + Estado en Streamlit (Recomendado)**

```python
# ✅ Backend STATELESS
@app.post("/calculate_proposal")
async def calculate_proposal(request: ProposalRequest):
    """
    API sin estado: recibe TODOS los datos en cada request.
    No mantiene sesión, no almacena nada entre requests.
    """
    # Calcular
    nodes = [calculate_item_node(item) for item in request.items]
    integrated = recalculate_integrated_node(nodes)
    
    # Retornar TODO calculado
    return {
        "nodes": nodes,
        "integrated": integrated,
        "proposal_id": request.proposal_id  # Cliente gestiona IDs
    }

# ✅ Frontend mantiene TODO el estado
import streamlit as st

# Session state almacena:
if "proposal_data" not in st.session_state:
    st.session_state.proposal_data = {
        "id": str(uuid.uuid4()),
        "lines": [],
        "calculated_nodes": None,
        "integrated_node": None
    }

# Agregar línea (local)
if st.button("Agregar"):
    st.session_state.proposal_data["lines"].append({
        "sku": sku,
        "cost": cost_unit,
        "price": final_price
    })

# Calcular (enviar TODO a API)
if st.button("Calcular"):
    response = requests.post(
        "http://api:8000/calculate_proposal",
        json={
            "proposal_id": st.session_state.proposal_data["id"],
            "items": st.session_state.proposal_data["lines"]
        }
    )
    
    # Guardar resultados en session_state
    st.session_state.proposal_data["calculated_nodes"] = response.json()["nodes"]
    st.session_state.proposal_data["integrated_node"] = response.json()["integrated"]
```

**Ventajas:**
- ✅ API fácil de escalar (sin estado compartido)
- ✅ No requiere Redis/session storage
- ✅ Streamlit maneja session naturalmente
- ✅ Desarrollo más rápido

**Desventajas:**
- ❌ Payload grande si hay 1000+ líneas (>1MB JSON)
- ❌ Usuario pierde datos si cierra tab
- ❌ No funciona bien para colaboración multi-usuario

### **Opción 2: Stateful API + Redis Sessions**

```python
# Backend STATEFUL con Redis
import redis
import json
from datetime import timedelta

redis_client = redis.Redis(host='localhost', port=6379, db=0)

@app.post("/proposals/create")
async def create_proposal(tenant_id: str):
    """Crea propuesta vacía en backend."""
    proposal_id = str(uuid.uuid4())
    
    # Guardar en Redis
    proposal_data = {
        "id": proposal_id,
        "tenant_id": tenant_id,
        "lines": [],
        "created_at": datetime.now().isoformat()
    }
    
    redis_client.setex(
        f"proposal:{proposal_id}",
        timedelta(hours=2),  # TTL: 2 horas
        json.dumps(proposal_data)
    )
    
    return {"proposal_id": proposal_id}

@app.post("/proposals/{proposal_id}/add_line")
async def add_line(proposal_id: str, line: LineItem):
    """Agrega línea a propuesta en backend."""
    # Leer de Redis
    data = redis_client.get(f"proposal:{proposal_id}")
    if not data:
        raise HTTPException(404, "Proposal not found")
    
    proposal = json.loads(data)
    
    # Agregar línea
    proposal["lines"].append(line.dict())
    
    # Guardar actualizado
    redis_client.setex(
        f"proposal:{proposal_id}",
        timedelta(hours=2),
        json.dumps(proposal)
    )
    
    return {"status": "ok", "line_count": len(proposal["lines"])}

@app.post("/proposals/{proposal_id}/calculate")
async def calculate_proposal(proposal_id: str):
    """Calcula propuesta almacenada en backend."""
    # Leer de Redis
    data = redis_client.get(f"proposal:{proposal_id}")
    proposal = json.loads(data)
    
    # Calcular
    nodes = [calculate_item_node(line) for line in proposal["lines"]]
    
    # Guardar resultados en Redis
    proposal["calculated_nodes"] = nodes
    redis_client.setex(
        f"proposal:{proposal_id}",
        timedelta(hours=2),
        json.dumps(proposal)
    )
    
    return {"nodes": nodes}
```

```python
# Frontend simplificado (no mantiene líneas)
import streamlit as st

# Solo guardar proposal_id en session
if "proposal_id" not in st.session_state:
    # Crear propuesta en backend
    response = requests.post(
        "http://api:8000/proposals/create",
        params={"tenant_id": "tenant-123"}
    )
    st.session_state.proposal_id = response.json()["proposal_id"]

# Agregar línea (enviada inmediatamente a backend)
if st.button("Agregar"):
    response = requests.post(
        f"http://api:8000/proposals/{st.session_state.proposal_id}/add_line",
        json={"sku": sku, "cost": cost, "price": price}
    )
    st.success("Línea agregada")

# Calcular (backend trabaja con datos propios)
if st.button("Calcular"):
    response = requests.post(
        f"http://api:8000/proposals/{st.session_state.proposal_id}/calculate"
    )
    nodes = response.json()["nodes"]
    st.write(nodes)
```

**Ventajas:**
- ✅ Payload HTTP pequeño (solo IDs)
- ✅ Persistencia automática (sobrevive refresh)
- ✅ Colaboración multi-usuario posible
- ✅ Datos centralizados

**Desventajas:**
- ❌ Complejidad: Redis, TTL management, cleanup
- ❌ Costo: Redis instance en producción
- ❌ Single point of failure (si Redis cae)
- ❌ Sincronización más compleja

### **Recomendación: Híbrido**

```python
# Stateless API + Persistencia opcional
@app.post("/proposals/save")
async def save_proposal(request: ProposalRequest):
    """
    Guarda propuesta en DB (NO en Redis).
    Usado solo cuando usuario hace "Guardar" explícito.
    """
    from infrastructure.repositories import ProposalRepository
    
    proposal = Proposal.from_request(request)
    repo = ProposalRepository()
    repo.save(proposal)
    
    return {"proposal_id": proposal.id, "saved_at": datetime.now()}

# Streamlit trabaja con session_state
# Solo persiste a DB cuando usuario solicita
```

**Criterios de Éxito:**
- ✅ 0 pérdida de datos durante sesión activa
- ✅ Payload <100KB para 100 líneas
- ✅ Session recovery <500ms
- ✅ Manejo correcto de timeouts

**Tiempo Estimado:** 1 semana  
**Riesgo:** 🔴 ALTO - Pérdida de datos de usuario

---

## 🟡 RETO #4: Autenticación y Multitenancy en API

### **Problema: API debe validar tenant_id en cada request**

```python
# ✅ Backend con autenticación
from fastapi import Depends, HTTPException, Header
from typing import Optional
import jwt

SECRET_KEY = os.getenv("JWT_SECRET_KEY")

def get_current_tenant(
    authorization: Optional[str] = Header(None)
) -> str:
    """Extrae y valida tenant_id del JWT."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing authentication")
    
    token = authorization.replace("Bearer ", "")
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        tenant_id = payload.get("tenant_id")
        
        if not tenant_id:
            raise HTTPException(401, "Invalid token")
        
        return tenant_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

@app.post("/calculate_proposal")
async def calculate_proposal(
    request: ProposalRequest,
    tenant_id: str = Depends(get_current_tenant)  # ✅ Injection automática
):
    """Endpoint protegido con autenticación."""
    # tenant_id ya validado
    context = {"tenant_id": tenant_id, "user_id": "default"}
    
    # Pasar a domain services
    nodes = calculate_with_context(request.items, context)
    
    return {"nodes": nodes}
```

```python
# Frontend con login
import streamlit as st
import requests

# Login page
if "token" not in st.session_state:
    st.title("Login")
    tenant_id = st.text_input("Tenant ID")
    password = st.text_input("Password", type="password")
    
    if st.button("Login"):
        # Autenticar con backend
        response = requests.post(
            "http://api:8000/auth/login",
            json={"tenant_id": tenant_id, "password": password}
        )
        
        if response.status_code == 200:
            st.session_state.token = response.json()["access_token"]
            st.session_state.tenant_id = tenant_id
            st.rerun()
        else:
            st.error("Login failed")
    
    st.stop()

# Páginas principales (usuario autenticado)
# Incluir token en TODAS las llamadas
headers = {"Authorization": f"Bearer {st.session_state.token}"}

response = requests.post(
    "http://api:8000/calculate_proposal",
    json={"items": lines},
    headers=headers  # ✅ Auth en cada request
)
```

**Criterios de Éxito:**
- ✅ 100% de endpoints protegidos
- ✅ Tokens expiran en 1 hora
- ✅ Refresh token implementado
- ✅ Middleware de logging por tenant

**Tiempo Estimado:** 3-5 días  
**Riesgo:** 🟡 MEDIO - Seguridad comprometida

---

## 🟡 RETO #5: Testing End-to-End Distribuido

### **Problema: Tests requieren coordinar API + UI + DB**

```python
# tests/e2e/test_full_workflow.py
import pytest
import requests
from fastapi.testclient import TestClient
from main import app

@pytest.fixture
def api_client():
    """Test client para FastAPI."""
    return TestClient(app)

@pytest.fixture
def test_db():
    """Database de test aislada."""
    # Setup: crear DB temporal
    db = create_test_database()
    yield db
    # Teardown: limpiar
    db.drop_all()

def test_complete_proposal_workflow(api_client, test_db):
    """
    Test E2E completo:
    1. Crear propuesta
    2. Agregar líneas
    3. Calcular
    4. Validar resultados
    """
    # 1. Crear propuesta
    response = api_client.post(
        "/proposals/create",
        params={"tenant_id": "test-tenant"}
    )
    assert response.status_code == 200
    proposal_id = response.json()["proposal_id"]
    
    # 2. Agregar líneas
    lines = [
        {"cost": "100", "margin": "0.30", "quantity": "5"},
        {"cost": "200", "margin": "0.25", "quantity": "3"}
    ]
    
    for line in lines:
        response = api_client.post(
            f"/proposals/{proposal_id}/add_line",
            json=line
        )
        assert response.status_code == 200
    
    # 3. Calcular
    response = api_client.post(f"/proposals/{proposal_id}/calculate")
    assert response.status_code == 200
    
    # 4. Validar resultados
    data = response.json()
    assert len(data["nodes"]) == 2
    
    # Validar cálculos exactos
    node1 = data["nodes"][0]
    assert float(node1["subtotal_revenue"]) == 650.0  # 100*1.30*5
    
    node2 = data["nodes"][1]
    assert float(node2["subtotal_revenue"]) == 750.0  # 200*1.25*3
    
    total = data["integrated"]["total_revenue"]
    assert float(total) == 1400.0  # 650 + 750
```

**Criterios de Éxito:**
- ✅ Tests E2E corren en <30 segundos
- ✅ 90%+ coverage de API endpoints
- ✅ Tests de integración con DB
- ✅ CI/CD pipeline automatizado

**Tiempo Estimado:** 1 semana  
**Riesgo:** 🟡 MEDIO - Bugs no detectados

---

## 📊 Comparación Final: Refactor vs API-First

### **Tiempo de Implementación:**

```
REFACTOR IN-PLACE (8-10 semanas):
├── Semana 1-2:  Domain Layer (entities, value objects, services)
├── Semana 3-4:  Application Layer (use cases, interfaces)
├── Semana 5:    Infrastructure Layer (repositories)
├── Semana 6-7:  Presentation Layer (dividir app.py)
└── Semana 8-10: Testing + refinamiento

API-FIRST (8-11 semanas):
├── Semana 1-2:  Setup FastAPI + estructura básica
├── Semana 3-4:  Domain Layer (igual que refactor)
├── Semana 5-6:  API endpoints + autenticación
├── Semana 7:    Estado distribuido (Redis o stateless)
├── Semana 8-9:  Migrar Streamlit a API calls
├── Semana 10:   Performance tuning (batch, cache, async)
└── Semana 11:   Testing E2E + deployment

PLAN HÍBRIDO (10-13 semanas):
├── Fase 1: Refactor In-Place (6 semanas)
│   ├── Domain Layer limpio
│   ├── Tests exhaustivos
│   └── Arquitectura probada
├── Fase 2: Extract API (3 semanas)
│   ├── FastAPI wrapper de domain services
│   ├── Endpoints básicos funcionando
│   └── Streamlit migrado gradualmente con feature flags
└── Fase 3: Full API Migration (1-2 semanas)
    ├── Toda lógica en API
    ├── Streamlit solo renderiza
    └── Performance optimizado
```

### **Complejidad Técnica:**

| Aspecto | Refactor | API-First | Ganador |
|---------|----------|-----------|---------|
| **Learning Curve** | Media | Alta | Refactor |
| **DevOps Required** | Bajo | Alto | Refactor |
| **Debugging** | Fácil | Complejo | Refactor |
| **Performance Tuning** | Simple | Crítico | Refactor |
| **Escalabilidad Futura** | Limitada | Excelente | API-First |
| **Reusabilidad** | Baja | Alta | API-First |
| **Testing** | Directo | Distribuido | Refactor |
| **Deployment** | Simple | Orquestado | Refactor |

### **Riesgos:**

| Riesgo | Refactor | API-First | Mitigación |
|--------|----------|-----------|------------|
| **Romper lógica de negocio** | 🟡 Medio | 🔴 Alto | Tests exhaustivos ANTES |
| **Performance degradada** | 🟢 Bajo | 🔴 Alto | Batch + Cache + Async |
| **Pérdida de datos** | 🟢 Bajo | 🟡 Medio | Stateless API + session_state |
| **Security issues** | 🟢 Bajo | 🔴 Alto | JWT + validación tenant |
| **Deployment complejo** | 🟢 Bajo | 🔴 Alto | Docker + CI/CD |

---

## ✅ Recomendación Final: Plan Híbrido

### **Por qué Híbrido es Superior:**

1. **Reduce Riesgo:**
   - Refactor primero → arquitectura probada
   - Extract API después → migración gradual
   - Rollback fácil en cada fase

2. **Aprendizaje Incremental:**
   - Domina Clean Architecture en monolito
   - Luego aprende APIs distribuidas
   - No abruma al equipo

3. **Entrega de Valor Continua:**
   - Semana 6: Código más limpio ya entregable
   - Semana 9: API básica funcionando
   - Semana 13: Sistema completo API-First

4. **Flexibilidad:**
   - Puedes detenerte en Fase 1 si API no es necesaria
   - O acelerar Fase 2 si necesitas API urgentemente

### **Timeline Híbrido Detallado:**

```
FASE 1: REFACTOR IN-PLACE (Semanas 1-6)
└─ Objetivo: Código limpio, testeable, mantenible

Semana 1:
├── Crear estructura src/ con 4 capas
├── Extraer PLAYBOOKS a shared/config.py
├── Tests de validación para calculate_item_node()
└── Checkpoint: Quick wins entregados

Semana 2-3:
├── Domain Layer completo
│   ├── Entities: Proposal, Quote, QuoteLine
│   ├── Value Objects: Money, Margin, HealthStatus
│   └── Services: ProfitabilityCalculator, HealthEvaluator
├── Tests unitarios: 80% coverage en domain
└── Checkpoint: Domain probado sin romper código actual

Semana 4-5:
├── Application Layer
│   ├── Use Cases: CreateProposal, AddItem, CompareQuotes
│   ├── Interfaces: IProposalRepository, IQuoteRepository
│   └── DTOs para transferencia de datos
├── Infrastructure: Repositories implementados
└── Checkpoint: Arquitectura completa en monolito

Semana 6:
├── Presentation Layer: dividir app.py en páginas
├── Tests de integración
├── Deployment de versión refactorizada
└── Checkpoint: ✅ Sistema funcionando con arquitectura limpia

FASE 2: EXTRACT API (Semanas 7-9)
└─ Objetivo: API funcionando en paralelo

Semana 7:
├── Setup FastAPI project
├── Exponerse domain services como endpoints
├── Endpoint /calculate_prices_batch
└── Checkpoint: API básica respondiendo

Semana 8:
├── Feature flag: USE_API=true/false
├── Streamlit llama API cuando flag activo
├── Comparación shadow mode: API vs monolito
└── Checkpoint: Streamlit funciona con API

Semana 9:
├── Autenticación JWT
├── Batch + Cache + Async optimizations
├── Testing E2E
└── Checkpoint: API production-ready

FASE 3: FULL MIGRATION (Semanas 10-13)
└─ Objetivo: 100% API-First, Streamlit terminal

Semana 10-11:
├── Migrar todas las páginas a API calls
├── Eliminar lógica de negocio de Streamlit
├── Performance tuning
└── Checkpoint: Streamlit es terminal pura

Semana 12:
├── Deployment distribuido (API + UI separados)
├── Monitoreo y alertas
├── Documentation
└── Checkpoint: Sistema API-First en producción

Semana 13:
├── Cleanup: eliminar código legacy
├── Optimizaciones finales
├── Retrospectiva y demos
└── Checkpoint: ✅ DONE - Arquitectura API-First completa
```

### **Métricas de Éxito (Por Fase):**

**Fase 1 (Semana 6):**
- ✅ 0 regresiones en funcionalidad
- ✅ Código coverage: 80%+
- ✅ app.py reducido de 3,387 líneas a <500
- ✅ Percentil arquitectura: 60-70%

**Fase 2 (Semana 9):**
- ✅ API responde en <200ms (p95) para 100 líneas
- ✅ Shadow mode: 0 discrepancias en 10,000 requests
- ✅ Streamlit funciona con flag API activado
- ✅ Percentil arquitectura: 75-80%

**Fase 3 (Semana 13):**
- ✅ 100% de lógica en API
- ✅ Deployment independiente UI/API
- ✅ Throughput: 500+ req/s
- ✅ Percentil arquitectura: 85-90% ✅

---

## 🚀 Próximos Pasos Inmediatos

### **Decisión Requerida:**

¿Qué camino tomar?

| Opción | Pros | Contras | Tiempo |
|--------|------|---------|--------|
| **A. Refactor In-Place** | ✅ Bajo riesgo, aprendizaje gradual | ❌ No escala a largo plazo | 8-10 sem |
| **B. API-First Directo** | ✅ Arquitectura final desde día 1 | ❌ Alto riesgo, curva empinada | 8-11 sem |
| **C. Plan Híbrido** ⭐ | ✅ Mejor de ambos mundos | ⏳ Más largo (pero seguro) | 10-13 sem |

### **Si eligen Plan Híbrido (Recomendado):**

**Semana 1 - Quick Wins:**
1. Crear estructura `src/` con 4 carpetas
2. Extraer PLAYBOOKS a `src/shared/config.py`
3. Crear tests para `calculate_item_node()`
4. Implementar wrapper pattern para shadow mode

**Código para empezar HOY:**

```bash
# Setup estructura
mkdir -p src/{domain,application,infrastructure,presentation,shared}
mkdir -p tests/{unit,integration,e2e}

# Crear archivo de configuración
cat > src/shared/config.py << 'EOF'
"""Configuración centralizada del sistema."""
PLAYBOOKS = {
    "General": {
        "green": 0.35,
        "yellow": 0.25,
        "max_red_green": 0.1,
        "max_red_yellow": 0.3,
        "weights": {"health": 0.30, "margin": 0.45, "profit": 0.25}
    },
    # ... resto de playbooks
}
EOF

# Instalar dependencias adicionales
pip install pytest pytest-cov fastapi pydantic redis

# Crear primer test
cat > tests/unit/test_calculate_item_node.py << 'EOF'
import pytest
from decimal import Decimal
from aup_engine import calculate_item_node

def test_calculate_item_node_basic():
    """Test básico de cálculo de nodo."""
    item = {
        "cost_unit": "100",
        "quantity": "3",
        "final_price_unit": "150"
    }
    
    result = calculate_item_node(item)
    
    assert result["subtotal_cost"] == 300.0
    assert result["subtotal_revenue"] == 450.0
    assert result["margin_pct"] == 50.0
    assert result["health"] == "verde"
EOF

# Correr tests
pytest tests/unit/ -v
```

---

## 📚 Recursos y Referencias

### **Arquitectura:**
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Clean Architecture - Robert Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [API Design Patterns](https://microservices.io/patterns/index.html)

### **Performance:**
- [Redis Caching Strategies](https://redis.io/docs/manual/patterns/)
- [Async Python with asyncio](https://docs.python.org/3/library/asyncio.html)
- [Batch Processing Best Practices](https://www.nginx.com/blog/avoiding-top-10-nginx-configuration-mistakes/)

### **Testing:**
- [pytest Documentation](https://docs.pytest.org/)
- [FastAPI Testing](https://fastapi.tiangolo.com/tutorial/testing/)
- [E2E Testing Strategies](https://martinfowler.com/articles/practical-test-pyramid.html)

---

**Última actualización:** 5 de Febrero, 2026  
**Próxima revisión:** Al finalizar Fase 1 (Semana 6)  
**Owner:** GitHub Copilot  
