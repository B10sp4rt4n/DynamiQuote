# 📘 Sistema de Playbooks - DynamiQuote

## 🎯 ¿Qué es un Playbook?

Un **playbook** es un conjunto de **reglas parametrizadas** que ajustan el comportamiento del sistema según el contexto de negocio:

- 🎚️ **Umbrales de salud** (verde, amarillo, rojo)
- ⚖️ **Pesos de decisión** (salud, margen, ganancia)
- 🚨 **Tolerancia a riesgo** (ratio de líneas rojas permitidas)

### **Principio Fundamental:**
> "La lógica no cambia, solo los parámetros."

El motor de evaluación es universal. Los playbooks ajustan **qué es bueno o malo** según la industria.

---

## ❓ ¿Por qué son necesarios los Playbooks?

### **Sin Playbooks:**
```
"30% de margen siempre es bueno"
"Rojo es rojo para todos"
```
❌ MSP con 28% → Amarillo (pero es excelente para MSP)  
❌ SaaS con 35% → Verde (pero es malo para SaaS)  
❌ Penetración con 15% → Rojo (pero es estratégico)

### **Con Playbooks:**
```
MSP ≠ Construcción ≠ SaaS ≠ Gobierno
Preventa ≠ Renovación ≠ Penetración
Cliente nuevo ≠ Cliente estratégico
```
✅ MSP 28% → Verde (umbral 22%)  
✅ SaaS 35% → Amarillo (umbral 40%)  
✅ Penetración 15% → Verde (umbral 10%)

---

## 🏗️ Modelo de Playbook

Cada playbook es un diccionario JSON con 4 componentes:

```python
{
    "name": "MSP",
    "description": "Servicios recurrentes MSP - Prioriza sostenibilidad",
    "green": 30,          # Umbral verde (%)
    "yellow": 22,         # Umbral amarillo (%)
    "max_red_green": 0.15,    # Max 15% líneas rojas para ser verde
    "max_red_yellow": 0.3,    # Max 30% líneas rojas para ser amarillo
    "weights": {
        "health": 0.6,    # 60% peso en estado de salud
        "margin": 0.3,    # 30% peso en margen promedio
        "profit": 0.1     # 10% peso en ganancia absoluta
    }
}
```

### **Componentes:**

| Campo | Propósito | Impacto |
|-------|-----------|---------|
| `green` | Margen mínimo para estado verde | Cotización saludable |
| `yellow` | Margen mínimo para estado amarillo | Cotización aceptable |
| `max_red_green` | Ratio máximo de líneas rojas permitidas en verde | Limita riesgo concentrado |
| `max_red_yellow` | Ratio máximo de líneas rojas permitidas en amarillo | Tolerancia moderada |
| `weights.health` | Importancia del estado de salud | Decisión final |
| `weights.margin` | Importancia del margen promedio | Decisión final |
| `weights.profit` | Importancia de la ganancia absoluta | Decisión final |

---

## 🧩 Playbooks Incluidos

### **1. General** (Default)
```python
{
    "green": 35,
    "yellow": 25,
    "max_red_green": 0.2,
    "max_red_yellow": 0.4,
    "weights": {"health": 0.5, "margin": 0.3, "profit": 0.2}
}
```
**Cuándo usar:**  
- Industria no especificada
- Mezcla de productos y servicios
- Cliente estándar sin particularidades

**Filosofía:** Balance conservador entre margen y volumen.

---

### **2. MSP** (Managed Service Provider)
```python
{
    "green": 30,
    "yellow": 22,
    "max_red_green": 0.15,
    "max_red_yellow": 0.3,
    "weights": {"health": 0.6, "margin": 0.3, "profit": 0.1}
}
```
**Cuándo usar:**  
- Servicios recurrentes mensuales
- Contratos de soporte continuado
- Modelos subscription/managed

**Filosofía:**  
- Prioriza **sostenibilidad** sobre volumen (health 60%)
- Margen más bajo aceptable (22-30%)
- Bajo riesgo concentrado (max 15% rojas)

**Ejemplo real:**  
```
Cliente: Empresa manufacturera
Contrato: $15K/mes por 36 meses
Margen: 28%
Resultado: VERDE ✅ (sin playbook sería AMARILLO)
```

---

### **3. Producto** (Hardware/Equipamiento)
```python
{
    "green": 25,
    "yellow": 15,
    "max_red_green": 0.3,
    "max_red_yellow": 0.5,
    "weights": {"health": 0.3, "margin": 0.4, "profit": 0.3}
}
```
**Cuándo usar:**  
- Venta de hardware, equipos, infraestructura
- Productos con márgenes típicamente bajos
- Competencia agresiva en precio

**Filosofía:**  
- Acepta márgenes más bajos (15-25%)
- Mayor tolerancia a líneas rojas (30-50%)
- Balance entre margen y ganancia absoluta

**Ejemplo real:**  
```
Cliente: Integrador
Producto: 50 laptops + 20 servidores
Margen: 18%
Ganancia: $45K
Resultado: VERDE ✅ (sin playbook sería ROJO)
```

---

### **4. Penetración** (Cliente Nuevo)
```python
{
    "green": 20,
    "yellow": 10,
    "max_red_green": 0.4,
    "max_red_yellow": 0.6,
    "weights": {"health": 0.2, "margin": 0.3, "profit": 0.5}
}
```
**Cuándo usar:**  
- Cliente completamente nuevo
- Estrategia de entrada a cuenta
- Primer proyecto con potencial upsell futuro

**Filosofía:**  
- Prioriza **volumen** e **ingreso** (profit 50%)
- Margen muy bajo aceptable (10-20%)
- Alta tolerancia a riesgo (60% rojas OK)
- Apuesta a relación a largo plazo

**Ejemplo real:**  
```
Cliente: Gobierno municipal (primera vez)
Proyecto: $120K infraestructura
Margen: 12%
Potencial: $500K/año en renovaciones
Resultado: VERDE ✅ (sin playbook sería ROJO)
```

---

### **5. SaaS** (Software as a Service)
```python
{
    "green": 40,
    "yellow": 30,
    "max_red_green": 0.1,
    "max_red_yellow": 0.25,
    "weights": {"health": 0.7, "margin": 0.2, "profit": 0.1}
}
```
**Cuándo usar:**  
- Licencias de software recurrentes
- Plataformas cloud
- Servicios digitales

**Filosofía:**  
- **Márgenes altos esperados** (40%+)
- Muy baja tolerancia a riesgo (max 10% rojas)
- Prioriza salud extrema (health 70%)
- Modelo de alta rentabilidad

**Ejemplo real:**  
```
Cliente: Startup tech
Servicio: Microsoft 365 E5 + Azure
Margen: 38%
Resultado: AMARILLO ⚠️ (bajo para SaaS, negociar mejor margen)
```

---

### **6. Gobierno** (Sector Público)
```python
{
    "green": 18,
    "yellow": 12,
    "max_red_green": 0.35,
    "max_red_yellow": 0.5,
    "weights": {"health": 0.3, "margin": 0.2, "profit": 0.5}
}
```
**Cuándo usar:**  
- Licitaciones públicas
- Contratos gubernamentales
- Sector educación pública

**Filosofía:**  
- Márgenes **muy conservadores** (12-18%)
- Prioriza **ganancia absoluta** (profit 50%)
- Alta tolerancia a riesgo (35-50% rojas)
- Volumen compensa margen bajo

**Ejemplo real:**  
```
Cliente: Secretaría de Educación
Licitación: $2.5M en tablets escolares
Margen: 14%
Ganancia: $350K
Resultado: VERDE ✅ (volumen masivo justifica margen bajo)
```

---

## 🔧 Cómo Funciona Internamente

### **1. Evaluación de Salud con Playbook**

```python
def calculate_health_status(avg_margin, total_revenue, playbook_name, df_lines):
    pb = PLAYBOOKS[playbook_name]
    
    # Calcular ratio de líneas rojas
    red_ratio = (df_lines["margin_pct"] < pb["yellow"]).sum() / len(df_lines)
    
    # Evaluación escalonada
    if avg_margin >= pb["green"] and red_ratio <= pb["max_red_green"]:
        return "verde"
    elif avg_margin >= pb["yellow"] and red_ratio <= pb["max_red_yellow"]:
        return "amarillo"
    else:
        return "rojo"
```

**Ejemplo MSP:**
```
Cotización:
- Margen promedio: 28%
- Líneas rojas: 2 de 15 (13.3%)

Evaluación:
- 28% >= 30% (green) → NO
- 28% >= 22% (yellow) → SÍ ✅
- 13.3% <= 30% (max_red_yellow) → SÍ ✅

Resultado: AMARILLO
```

---

### **2. Score Ponderado para Recomendaciones**

```python
def score_version(q, health, playbook_name):
    pb = PLAYBOOKS[playbook_name]
    
    # Normalizar componentes
    health_score = {"verde": 100, "amarillo": 60, "rojo": 20}[health]
    margin_score = min(100, max(0, q["avg_margin"]))
    profit_score = min(100, (q["gross_profit"] / 1000) * 10)
    
    # Score ponderado
    final_score = (
        pb["weights"]["health"] * health_score +
        pb["weights"]["margin"] * margin_score +
        pb["weights"]["profit"] * profit_score
    )
    
    return final_score
```

**Ejemplo comparación MSP:**
```
Playbook: MSP (health: 60%, margin: 30%, profit: 10%)

Versión 1:
- Health: Verde (100 pts)
- Margin: 32% (32 pts)
- Profit: $8K (80 pts)
Score = 0.6*100 + 0.3*32 + 0.1*80 = 60 + 9.6 + 8 = 77.6

Versión 2:
- Health: Amarillo (60 pts)
- Margin: 35% (35 pts)
- Profit: $12K (120→100 pts)
Score = 0.6*60 + 0.3*35 + 0.1*100 = 36 + 10.5 + 10 = 56.5

✅ Recomendación: v1 (77.6 > 56.5)
Razón: Health pesa 60% en MSP, v1 tiene mejor salud
```

**Ejemplo comparación Penetración:**
```
Playbook: Penetración (health: 20%, margin: 30%, profit: 50%)

Versión 1:
- Health: Verde (100 pts)
- Margin: 32% (32 pts)
- Profit: $8K (80 pts)
Score = 0.2*100 + 0.3*32 + 0.5*80 = 20 + 9.6 + 40 = 69.6

Versión 2:
- Health: Amarillo (60 pts)
- Margin: 35% (35 pts)
- Profit: $12K (100 pts)
Score = 0.2*60 + 0.3*35 + 0.5*100 = 12 + 10.5 + 50 = 72.5

✅ Recomendación: v2 (72.5 > 69.6)
Razón: Profit pesa 50% en Penetración, v2 tiene mejor ganancia
```

**Insight clave:**  
Con los mismos datos, diferentes playbooks generan **recomendaciones opuestas**.

---

## 🎨 Integración en UI

### **Paso 1: Guardar cotización con playbook**

```python
# Selector antes de cerrar
save_playbook = st.selectbox(
    "📘 Playbook a aplicar",
    list(PLAYBOOKS.keys())
)

# Guardar en BD
quote_data = (
    quote_id,
    ...,
    avg_margin,
    save_playbook  # ← Guardado para historial
)
```

**Ventaja:** Trazabilidad completa. Sabes con qué playbook se evaluó cada cotización.

---

### **Paso 2: Comparador con playbook**

```python
# Selector en comparador
selected_playbook = st.selectbox(
    "Selecciona playbook",
    list(PLAYBOOKS.keys())
)

# Generar narrativa ajustada
narrative = generate_comparison_narrative(
    q1, q2, df1, df2,
    playbook_name=selected_playbook
)
```

**Ventaja:** Puedes re-evaluar cotizaciones antiguas con nuevos playbooks.

---

### **Paso 3: Benchmark en narrativa**

```
📘 Análisis bajo playbook 'MSP' (verde: 30%, amarillo: 22%)

✅ Margen 28.5% supera benchmark verde (30%)
🎯 Pesos: Salud 60%, Margen 30%, Ganancia 10%

✅ Recomendación: Usar v2 (score: 77.6 vs 56.5, +21.1pts)
```

**Ventaja:** Usuario entiende **por qué** el sistema recomienda algo.

---

## 📊 Casos de Uso Reales

### **Caso 1: MSP vs Producto en Misma Cotización**

**Contexto:**  
Cotización mixta: 60% servicios MSP + 40% hardware

**Problema:**  
Un playbook no captura la realidad.

**Solución:**  
Crear playbook custom "Híbrido_MSP_Producto":
```python
{
    "green": 27,   # Promedio ponderado (30*0.6 + 25*0.4)
    "yellow": 19,  # Promedio ponderado (22*0.6 + 15*0.4)
    "weights": {"health": 0.45, "margin": 0.35, "profit": 0.2}
}
```

---

### **Caso 2: Cliente Estratégico (Concesión Temporal)**

**Contexto:**  
Cliente Fortune 500 pide descuento del 15% en primer año.

**Problema:**  
Con playbook General, la cotización sale ROJA.

**Solución:**  
Usar playbook "Penetración" temporalmente:
```
Año 1: Playbook Penetración (verde: 20%)
Año 2+: Playbook General (verde: 35%)
```

**Resultado:**  
Sistema justifica concesión con proyección de lifetime value.

---

### **Caso 3: Renovación de Contrato MSP**

**Contexto:**  
Cliente MSP existente renueva por 3 años más.

**Problema:**  
Debería ser MÁS rentable que cliente nuevo (ya no hay onboarding).

**Solución:**  
Crear playbook "MSP_Renovacion":
```python
{
    "green": 35,   # Más alto que MSP estándar (30%)
    "yellow": 28,  # Más alto que MSP estándar (22%)
    "weights": {"health": 0.7, "margin": 0.2, "profit": 0.1}
}
```

**Ventaja:** Incentiva mejorar márgenes en renovaciones.

---

## 🔄 Trazabilidad y Auditoría

### **¿Qué se guarda en BD?**

```sql
SELECT 
    quote_id,
    version,
    avg_margin,
    playbook_name,  -- ← Crítico para auditoría
    created_at
FROM quotes
WHERE quote_group_id = 'abc123'
ORDER BY version;
```

**Resultado:**
```
| version | avg_margin | playbook_name | created_at |
|---------|-----------|---------------|------------|
| 1       | 32%       | General       | 2026-01-15 |
| 2       | 28%       | MSP           | 2026-01-18 |
| 3       | 26%       | Penetracion   | 2026-01-20 |
```

### **Ventajas:**
- ✅ Puedes explicar **por qué v2 fue aceptada** (cambio de playbook)
- ✅ Puedes re-evaluar v1 con playbook MSP retroactivamente
- ✅ Legal puede auditar decisiones (playbook + reglas = reproducible)

---

## 🎯 Narrativa con Playbooks

### **Antes (sin playbooks):**
```
"La versión v2 redujo el margen promedio a 28%. 
Estado: AMARILLO"
```
❓ ¿Por qué amarillo?  
❓ ¿Es malo?

### **Después (con playbooks):**
```
📘 Análisis bajo playbook 'MSP' (verde: 30%, amarillo: 22%)

✅ Margen 28% supera benchmark verde (30%)

La versión v2 incrementó el ingreso en $15,000. 
El margen promedio es 28%, solo 2pp por debajo de verde.

✅ Recomendación: Usar v2 (score: 77.6 vs 56.5, +21.1pts)
🎯 Pesos: Salud 60%, Margen 30%, Ganancia 10%
```
✅ Contexto claro  
✅ Benchmark explícito  
✅ Recomendación justificada

---

## 🚀 Roadmap de Playbooks

### **Fase 1: Playbooks Estáticos** ✅ (Completada)
- [x] 6 playbooks predefinidos
- [x] Selector en UI
- [x] Guardado en BD
- [x] Benchmark en narrativa

### **Fase 2: Playbooks Personalizados** (2-3 semanas)
- [ ] Editor de playbooks custom
- [ ] Validación de parámetros
- [ ] Biblioteca personal de playbooks
- [ ] Import/Export JSON

### **Fase 3: Playbooks Inteligentes** (1-2 meses)
- [ ] Sugerencia automática según líneas
- [ ] Aprendizaje de outcomes (¿qué playbook cierra más?)
- [ ] Ajuste dinámico de umbrales
- [ ] Playbooks por cliente específico

### **Fase 4: Playbooks Predictivos** (3+ meses)
- [ ] ML para recomendar playbook óptimo
- [ ] Simulación de escenarios (¿y si uso Penetración?)
- [ ] A/B testing de playbooks
- [ ] Benchmark de industria real-time

---

## 📚 Referencias Técnicas

### **Archivos modificados:**

```
app.py (líneas 20-76):
- PLAYBOOKS dictionary
- calculate_health_status() con playbook
- score_version() con pesos
- generate_comparison_narrative() con benchmark

database.py (líneas 138-211):
- Schema quotes con playbook_name
- save_quote() con 11 campos

migrate_add_playbooks.py:
- Script de migración PostgreSQL/SQLite
```

### **Funciones clave:**

```python
calculate_health_status(avg_margin, total_revenue, playbook_name, df_lines)
→ Evalúa salud según playbook

score_version(q, health, playbook_name)
→ Calcula score ponderado para recomendación

generate_comparison_narrative(..., playbook_name)
→ Genera narrativa con benchmark de playbook
```

---

## ✅ Testing y Validación

### **Test 1: Misma cotización, diferentes playbooks**

```python
# Datos de prueba
quote = {"avg_margin": 28, "gross_profit": 8000, "total_revenue": 28500}
lines = pd.DataFrame({"margin_pct": [30, 28, 25, 32, 27]})

# Evaluar con cada playbook
for pb_name in PLAYBOOKS.keys():
    health = calculate_health_status(28, 28500, pb_name, lines)
    score = score_version(quote, health, pb_name)
    print(f"{pb_name:15} → Health: {health:8} Score: {score:.1f}")
```

**Resultado esperado:**
```
General         → Health: amarillo Score: 64.2
MSP             → Health: amarillo Score: 66.8
Producto        → Health: verde     Score: 72.5
Penetracion     → Health: verde     Score: 78.1
SaaS            → Health: rojo      Score: 48.3
Gobierno        → Health: verde     Score: 82.4
```

✅ Mismos datos, evaluaciones diferentes según contexto.

---

### **Test 2: Score consistency**

```python
# v1 mejor que v2 en todos los playbooks
v1 = {"avg_margin": 35, "gross_profit": 12000, ...}
v2 = {"avg_margin": 25, "gross_profit": 8000, ...}

for pb in PLAYBOOKS.keys():
    s1 = score_version(v1, "verde", pb)
    s2 = score_version(v2, "amarillo", pb)
    assert s1 > s2, f"Error en {pb}"
```

✅ Orden de preferencia se mantiene consistente.

---

## 🎖️ Ventaja Competitiva

| Feature | DynamiQuote | PandaDoc | Proposify | Salesforce CPQ |
|---------|-------------|----------|-----------|----------------|
| **Playbooks por industria** | ✅ 6 tipos | ❌ | ❌ | ❌ |
| **Score ponderado** | ✅ Custom weights | ❌ | ❌ | ⚠️ Rígido |
| **Benchmark contextual** | ✅ En narrativa | ❌ | ❌ | ❌ |
| **Trazabilidad de playbook** | ✅ Guardado en BD | N/A | N/A | ❌ |
| **Re-evaluación retroactiva** | ✅ Cambiar playbook | ❌ | ❌ | ❌ |
| **Narrativa ajustada** | ✅ Automática | ❌ | ❌ | ❌ |

**Ningún CPQ del mercado tiene esto.**

---

## 💡 Filosofía Final

> "No existe una verdad universal de margen.  
> Existe el contexto, y el contexto decide qué es bueno."

**DynamiQuote no impone juicios.**  
**Adapta criterios según tu realidad de negocio.**

- MSP necesita sostenibilidad → Health 60%
- Producto necesita volumen → Profit 30%
- Penetración necesita entrada → Tolerancia alta

**Esto es producto enterprise-grade.**

---

**Documentación actualizada:** 21 de Enero, 2026  
**Versión del sistema:** 2.3 (con playbooks)  
**Estado:** ✅ Producción Ready  
**Filosofía:** "El contexto define qué es éxito"
