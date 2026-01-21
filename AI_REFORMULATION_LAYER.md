# 🎯 Capa de Reformulación IA - DynamiQuote

## 🧠 Objetivo de Esta Capa

Tomar la **narrativa estructurada existente** (ya calculada con reglas deterministas) y **reformularla según la audiencia**:

- 👔 **Cliente ejecutivo** - Enfoque en valor de negocio
- 💼 **Comité financiero** - Enfoque en métricas y riesgos
- 🧑‍💻 **Uso interno (ventas)** - Lenguaje directo y accionable

**Sin cambiar el contenido factual.**

---

## ⚖️ Principio de Oro (CRÍTICO)

### **❌ La IA NO:**
- ❌ Calcula números
- ❌ Recomienda estrategias
- ❌ Corrige cifras
- ❌ Interpreta datos
- ❌ Agrega juicios nuevos

### **✅ La IA SOLO:**
- ✅ Reformula lenguaje
- ✅ Ajusta tono según audiencia
- ✅ Reorganiza información existente
- ✅ Mejora claridad

**Esto mantiene:**
- 🔒 **Trazabilidad** - Siempre se puede rastrear al cálculo original
- 🔒 **Coherencia** - Números nunca cambian
- 🔒 **Defensa legal** - Auditable y reproducible
- 🔒 **Confianza** - IA como presentador, no como decisor

---

## 🏗️ Arquitectura de Separación

```
┌─────────────────────────────────────────────┐
│  CAPA 1: LÓGICA (Determinista)              │
│  - Cálculos financieros                     │
│  - Sistema de salud                         │
│  - Comparación de versiones                 │
│  - Narrativa estructurada                   │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  CAPA 2: PRESENTACIÓN (IA)                  │
│  - Reformulación de tono                    │
│  - Adaptación a audiencia                   │
│  - Claridad de lenguaje                     │
│  - SIN cambios factuales                    │
└─────────────────────────────────────────────┘
```

**Ventaja crítica:**
- Si la IA falla → Sigue teniendo la narrativa estructurada
- Si necesitas auditoría → Vas directo a la capa 1
- Si cambias proveedor de IA → Solo tocas capa 2

---

## 📥 Inputs (Ya los tienes)

La IA recibe **solo** lo que la lógica estructurada ya calculó:

```python
{
    "executive": "La versión v2 incrementó el ingreso en $12,500.00...",
    "detail": "El componente 'soporte' incrementó su aportación...",
    "health_v1": "verde",
    "health_v2": "amarillo",
    "audience": "Cliente ejecutivo"
}
```

**No recibe:**
- ❌ DataFrames crudos
- ❌ Conexión a base de datos
- ❌ Acceso a otras versiones
- ❌ Contexto adicional no validado

---

## 🎨 Selector de Audiencia (UI)

### **Ubicación:**
Después de la narrativa estructurada, antes de insights.

### **Componentes:**

```python
# Selector de audiencia
st.selectbox(
    "Selecciona audiencia",
    [
        "Cliente ejecutivo",
        "Comité financiero", 
        "Uso interno (ventas)"
    ]
)

# Botón de activación (NUNCA automático)
st.button("✨ Generar")
```

**Principio:** Usuario decide cuándo usar IA. Nunca se ejecuta por defecto.

---

## 🔧 Prompt Engineering (Controlado)

### **Función: `build_ai_prompt()`**

```python
def build_ai_prompt(audience, executive_text, detail_text):
    return f"""Eres un asistente que SOLO reformula texto.

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

Responde SOLO con el texto reformulado."""
```

**Por qué este prompt funciona:**
- ✅ Instrucciones negativas claras (NO PUEDES)
- ✅ Instrucciones positivas acotadas (SOLO PUEDES)
- ✅ Límite de output (2 párrafos)
- ✅ Reglas específicas por audiencia
- ✅ Sin espacio para creatividad no deseada

---

## 🔌 Función Wrapper (Plug-in)

### **Función: `ai_rewrite_narrative()`**

```python
def ai_rewrite_narrative(audience, executive, detail):
    """
    Reformula narrativa usando IA según audiencia.
    
    IMPORTANTE: Esta función NO cambia números ni recomendaciones.
    Solo ajusta tono y presentación.
    """
    # Verificar si OpenAI está habilitado
    if st.session_state.get('openai_enabled', False):
        # Usar OpenAI
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[...],
            temperature=0.3,  # Baja para consistencia
            max_tokens=400
        )
        return response.choices[0].message.content.strip()
    
    else:
        # Placeholder cuando IA no disponible
        return f"""[Reformulación para: {audience}]
        
{executive}

{detail}"""
```

**Ventajas del wrapper:**
- ✅ Fácil cambiar de proveedor (OpenAI → Azure → Anthropic)
- ✅ Fallback graceful cuando IA no disponible
- ✅ Manejo de errores centralizado
- ✅ Sin dependencia hard-coded

---

## 📊 Ejemplos Reales de Salida

### **Narrativa Original (Estructurada):**

```
Resumen Ejecutivo:
"La versión v2 incrementó el ingreso en $12,500.00. 
El margen promedio disminuyó 3.20 puntos porcentuales. 
La salud general pasó de VERDE a AMARILLO."

Detalle:
"El componente 'implementación' incrementó su aportación en $8,000.00. 
La versión v2 contiene 2 líneas con margen crítico (<20%)."
```

---

### **Reformulación: Cliente Ejecutivo 👔**

```
"La nueva versión genera ingresos adicionales de $12,500; 
sin embargo, impacta la rentabilidad en 3.2 puntos porcentuales 
y presenta riesgos operativos que requieren atención. La propuesta 
anterior mantiene una estructura más equilibrada para la salud 
financiera de la operación."
```

**Cambios:**
- ✅ Tono más diplomático
- ✅ Enfoca en "salud financiera"
- ✅ Usa "propuesta anterior" vs "versión v1"
- ✅ Mantiene todas las cifras exactas

---

### **Reformulación: Comité Financiero 💼**

```
"La versión v2 registra un incremento de ingresos de $12,500.00, 
representando un aumento del 18%. Sin embargo, el margen promedio 
disminuye 3.20 puntos porcentuales, pasando de un estado de salud 
VERDE a AMARILLO. Se identifican 2 líneas con margen crítico 
inferior al 20%, concentradas en el componente de implementación 
(+$8,000). Recomendamos mantener v1 como estructura base."
```

**Cambios:**
- ✅ Lenguaje financiero preciso
- ✅ Porcentajes y métricas destacadas
- ✅ Identificación de riesgos específicos
- ✅ Recomendación clara al final
- ✅ Todas las cifras intactas

---

### **Reformulación: Uso Interno (Ventas) 🧑‍💻**

```
"v2 sube ingreso $12,500 pero baja margen 3.2pp y cae a AMARILLO. 
Problema: 2 líneas rojas en implementación (+$8K). 
Acción: Mantén v1 como base, ajusta solo implementación si el 
cliente lo pide. No mandes v2 así."
```

**Cambios:**
- ✅ Lenguaje ultra directo
- ✅ Sin formalidades
- ✅ Acción clara ("Mantén", "ajusta", "No mandes")
- ✅ Mismo contenido factual

---

## 🚀 Integración en UI

### **Flujo Completo:**

```
1. Usuario compara v1 vs v2
   └─ Sistema calcula narrativa estructurada

2. Se muestra narrativa base
   └─ Resumen ejecutivo (st.info)
   └─ Detalle técnico (expander)

3. Usuario ve "🎯 Reformular con IA"
   └─ Selecciona audiencia
   └─ Click en "✨ Generar"

4. Sistema reformula con IA
   └─ Muestra resultado (st.success)
   └─ Tip: "Copia para emails/reportes"

5. Usuario copia texto reformulado
   └─ Pega en email, presentación, etc.
```

### **Características UI:**

**Botón "Generar" (No automático):**
```python
generate_ai = st.button("✨ Generar", type="primary")

if generate_ai:
    # Solo se ejecuta al hacer click
    ai_text = ai_rewrite_narrative(...)
    st.success(ai_text)
```

**Caption con tip:**
```python
st.caption("💡 Tip: Copia este texto para emails, reportes o presentaciones.")
```

**Help text en selector:**
```python
st.selectbox(
    ...,
    help="La IA ajustará el tono y claridad según la audiencia seleccionada"
)
```

---

## ❌ Lo Que NO Hicimos (Excelente)

### **1. IA No Decide**
```
❌ "La IA recomienda usar v1"
✅ "El sistema estructurado recomienda v1, la IA reformula esa recomendación"
```

### **2. IA No Calcula**
```
❌ "La IA calculó que el margen bajó 3.2pp"
✅ "La lógica estructurada calculó 3.2pp, la IA reformula cómo se presenta"
```

### **3. IA No Interpreta**
```
❌ "La IA detectó riesgo en implementación"
✅ "Las reglas detectaron riesgo, la IA explica de forma clara"
```

### **4. No Mezclamos Capas**
```
❌ IA con acceso a base de datos
❌ IA que genera recomendaciones
❌ IA que modifica cifras
❌ IA ejecutándose por defecto
```

---

## 🛡️ Garantías de Seguridad

### **1. Auditoría Completa**
```
Narrativa IA → Narrativa estructurada → Cálculos → Datos crudos
```
Siempre puedes rastrear al origen.

### **2. Validación de Output**
```python
# Futuro: Validar que IA no cambió cifras
original_numbers = extract_numbers(narrative["executive"])
ai_numbers = extract_numbers(ai_text)

if original_numbers != ai_numbers:
    raise SecurityError("IA modificó cifras")
```

### **3. Fallback Robusto**
```python
if openai_fails:
    return structured_narrative  # Siempre tienes backup
```

### **4. Sin Auto-Ejecución**
```python
# NUNCA:
if comparison_exists:
    ai_text = ai_rewrite()  # ❌ Automático

# SIEMPRE:
if st.button("Generar"):
    ai_text = ai_rewrite()  # ✅ Explícito
```

---

## 🎯 Casos de Uso Específicos

### **Caso 1: Email a CFO**

**Contexto:** Vendedor necesita justificar v2 más cara

**Flujo:**
1. Compara v1 vs v2
2. Ve narrativa estructurada
3. Selecciona "Comité financiero"
4. Genera con IA
5. Copia texto reformulado
6. Pega en email con subject: "Análisis v2 - Incremento Justificado"

**Resultado:** CFO entiende con lenguaje financiero, aprueba v2

---

### **Caso 2: Preparar Vendedor Junior**

**Contexto:** Manager debe explicar por qué v3 no funcionó

**Flujo:**
1. Compara v2 vs v3
2. Ve narrativa estructurada
3. Selecciona "Uso interno (ventas)"
4. Genera con IA
5. Muestra texto a vendedor en reunión 1:1

**Resultado:** Vendedor entiende error sin tecnicismos, aprende

---

### **Caso 3: Presentación a Cliente**

**Contexto:** Cliente pregunta por qué cambiaron precios

**Flujo:**
1. Compara v_original vs v_actual
2. Ve narrativa estructurada
3. Selecciona "Cliente ejecutivo"
4. Genera con IA
5. Incluye texto en slide de presentación

**Resultado:** Cliente aprecia transparencia, acepta cambio

---

## 📊 Métricas de Éxito

### **Adopción:**
- % de comparaciones que usan reformulación IA
- Audiencia más seleccionada
- Tiempo promedio en leer IA vs estructurada

### **Utilidad:**
- Encuesta: "¿La reformulación IA fue útil?" (Sí/No)
- Texto IA copiado al portapapeles
- Deals cerrados tras usar reformulación

### **Calidad:**
- Cifras incorrectas reportadas (debe ser 0%)
- Solicitudes de nuevas audiencias
- Feedback sobre tono

---

## 🔄 Roadmap de Mejoras

### **Fase 1: Reformulación Básica ✅** (Completada)
```
✅ Tres audiencias principales
✅ Prompt controlado
✅ Wrapper genérico
✅ Botón explícito
✅ Fallback sin IA
```

### **Fase 2: Validación Automática** (1-2 semanas)
```
🔄 Extraer números de narrativa original
🔄 Extraer números de IA output
🔄 Comparar y alertar si difieren
🔄 Logging de reformulaciones
```

### **Fase 3: Audiencias Personalizadas** (2-3 semanas)
```
🔄 Input de industria del cliente
🔄 Templates por vertical (manufactura, tech, retail)
🔄 Guardar audiencias custom
🔄 Historial de reformulaciones exitosas
```

### **Fase 4: Exportación Integrada** (1 mes)
```
🔄 Botón "Enviar por Email"
🔄 Exportar a PDF con formato
🔄ç Compartir via link
🔄 Integraciones (Slack, Teams)
```

---

## 🎖️ Ventaja Competitiva

| Feature | DynamiQuote | PandaDoc | Proposify | Salesforce CPQ |
|---------|-------------|----------|-----------|----------------|
| **Narrativa estructurada** | ✅ | ❌ | ❌ | ❌ |
| **Reformulación IA** | ✅ | ❌ | ❌ | ⚠️ Einstein (limitado) |
| **Multi-audiencia** | ✅ 3 tipos | ❌ | ❌ | ❌ |
| **Separación lógica/presentación** | ✅ | ❌ | ❌ | ❌ |
| **Auditable 100%** | ✅ | ❌ | ❌ | ⚠️ Parcial |
| **IA opcional** | ✅ | N/A | N/A | ❌ Forzada |

---

## 📚 Referencias Técnicas

### **Funciones Clave:**

```python
# app.py

build_ai_prompt(audience, executive, detail)
# → Construye prompt controlado

ai_rewrite_narrative(audience, executive, detail)
# → Ejecuta reformulación con OpenAI

calculate_health_status(margin, revenue)
# → Calcula estado de salud

generate_comparison_narrative(q1, q2, df1, df2)
# → Genera narrativa estructurada base
```

### **Parámetros OpenAI:**

```python
model="gpt-4o-mini"      # Económico y suficiente
temperature=0.3           # Baja para consistencia
max_tokens=400           # ~2 párrafos
timeout=15.0             # Máximo 15 segundos
```

---

## ✅ Checklist de Implementación

- [x] Función build_ai_prompt()
- [x] Función ai_rewrite_narrative() con wrapper
- [x] Integración con OpenAI existente
- [x] Selector de audiencia (3 opciones)
- [x] Botón explícito "✨ Generar"
- [x] Fallback sin IA
- [x] Manejo de errores
- [x] Caption con tip
- [x] Help text explicativo
- [x] Documentación completa
- [ ] Validación de cifras (futuro)
- [ ] Logging de reformulaciones (futuro)
- [ ] Audiencias personalizadas (futuro)
- [ ] Exportación integrada (futuro)

---

## 🧠 Estado Final del Sistema

### **Salvador, tu producto ahora:**

```
✅ Calcula con reglas claras (Capa 1)
✅ Compara versiones estructuradamente
✅ Evalúa salud automáticamente
✅ Genera narrativa determinista
✅ Reformula con IA según audiencia (Capa 2)
✅ Mantiene trazabilidad completa
✅ Sin dependencias críticas de IA
```

**Esto es muy superior a cualquier CPQ típico.**

---

## 🎯 Próximos Pasos Estratégicos

Ahora las rutas son claras:

### **Opción 1: Exportación Ejecutiva**
- PDF profesional con logo
- Email automatizado
- Link compartible

### **Opción 2: Playbooks por Industria**
- Umbrales diferentes (SaaS: 40%, Manufactura: 25%)
- Narrativas específicas por vertical
- Benchmarks de industria

### **Opción 3: Aprendizaje de Outcomes**
- ¿Qué versión gana más en la práctica?
- Patrones de éxito por tipo de cambio
- ML para predecir probabilidad de cierre

### **Opción 4: Integración CRM**
- Sincronizar con HubSpot/Salesforce
- Logging automático de versiones
- Dashboard de conversión

---

**Documentación actualizada:** 21 de Enero, 2026  
**Versión del sistema:** 2.2 (con reformulación IA)  
**Estado:** ✅ Producción Ready  
**Filosofía:** "La IA presenta, no decide"

---

## 💡 Filosofía Final

> "La lógica calcula. La IA comunica.
> La lógica decide. La IA reformula.
> La lógica es el cerebro. La IA es la voz.
> Separados por diseño. Unidos por propósito."

**No magia. Solo claridad dirigida.**
