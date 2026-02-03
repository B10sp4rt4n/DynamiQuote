# 📊 Propuesta: Módulo de Rentabilidad del Proyecto

## 🎯 Objetivo

Implementar un módulo que permita calcular la **rentabilidad real del proyecto** considerando todos los gastos asociados que impactan el margen neto, más allá de los costos directos de los productos/servicios cotizados.

---

## 📋 Alcance Funcional

### 1. Categorías de Gastos Asociados

| Categoría | Ejemplos | Tipo de Cálculo |
|-----------|----------|-----------------|
| 🚚 **Logística** | Envíos, fletes, maniobras, almacenaje | Monto fijo o % del ingreso |
| 🛡️ **Seguros** | Mercancía, responsabilidad civil, transporte | % del valor asegurado |
| 📋 **Fianzas** | Cumplimiento, anticipo, vicios ocultos | % del contrato |
| 💼 **Administrativos** | Comisiones, viáticos, hospedaje, representación | Monto fijo |
| ⚠️ **Contingencias** | Imprevistos, garantías, penalizaciones estimadas | % del proyecto |
| 💰 **Financieros** | Costo de capital, intereses, factoraje | % o monto fijo |

---

### 2. Nuevos KPIs del Dashboard

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Ingreso Total  │  │   Costo Total   │  │ Utilidad Bruta  │  │  Margen Bruto % │
│    $100,000     │  │    $65,000      │  │    $35,000      │  │     35.00%      │
└─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Gastos Asociados│  │  Utilidad Neta  │  │  Margen Neto %  │  │    Semáforo     │
│    $12,500      │  │    $22,500      │  │     22.50%      │  │    🟢 Verde     │
└─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘
```

**Fórmulas:**
- `Utilidad Bruta = Ingreso Total - Costo Total`
- `Utilidad Neta = Utilidad Bruta - Gastos Asociados`
- `Margen Bruto % = (Utilidad Bruta / Ingreso Total) × 100`
- `Margen Neto % = (Utilidad Neta / Ingreso Total) × 100`

---

### 3. Interfaz de Usuario Propuesta

#### Sección: "💰 Gastos Asociados del Proyecto"

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  💰 GASTOS ASOCIADOS DEL PROYECTO                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Agregar Gasto]                                                            │
│                                                                             │
│  Concepto: [____________________]  Categoría: [Logística ▼]                 │
│                                                                             │
│  Tipo de cálculo:  ○ Monto fijo   ○ Porcentaje del ingreso                  │
│                                                                             │
│  Monto/Porcentaje: [________]     [+ Agregar]                               │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  GASTOS REGISTRADOS                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  #  │ Concepto              │ Categoría    │ Tipo  │ Valor    │ Monto      │
│  1  │ Flete a sitio         │ Logística    │ Fijo  │ $3,500   │ $3,500     │
│  2  │ Fianza cumplimiento   │ Fianzas      │ 10%   │ 10%      │ $10,000    │
│  3  │ Seguro de mercancía   │ Seguros      │ 1.5%  │ 1.5%     │ $1,500     │
│  4  │ Viáticos instalación  │ Administrativo│ Fijo │ $2,000   │ $2,000     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                           TOTAL GASTOS ASOCIADOS: $17,000   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 4. Gráfico de Distribución Financiera (Pastel)

```
        Distribución del Ingreso Total
        
              ┌──────────────┐
             ╱                ╲
            │   Costo Directo │
            │      65%        │
            │                 │
             ╲   Gastos      ╱
              ╲  Asociados  ╱
               ╲   12.5%   ╱
                ╲        ╱
                 ╲      ╱
                  ╲────╱
                   Utilidad
                    Neta
                   22.5%
```

---

### 5. Integración con Playbooks

El semáforo de evaluación ahora considerará el **Margen Neto** en lugar del Margen Bruto:

| Playbook | Verde (Óptimo) | Amarillo (Aceptable) | Rojo (Riesgoso) |
|----------|----------------|----------------------|-----------------|
| General | ≥ 25% | 15-25% | < 15% |
| MSP | ≥ 20% | 12-20% | < 12% |
| SaaS | ≥ 30% | 20-30% | < 20% |
| Construcción | ≥ 18% | 10-18% | < 10% |
| Gobierno | ≥ 12% | 8-12% | < 8% |
| Penetración | ≥ 8% | 5-8% | < 5% |

---

### 6. Plantillas de Gastos Predefinidas

Para agilizar la captura, se pueden configurar plantillas por tipo de proyecto:

#### Plantilla: Proyecto Gobierno
```
- Fianza de cumplimiento: 10%
- Fianza de anticipo: 10% (si aplica)
- Fianza de vicios ocultos: 10%
- Seguro de responsabilidad civil: 2%
- Reserva imprevistos: 5%
```

#### Plantilla: Proyecto Construcción
```
- Flete a obra: (monto fijo)
- Seguro de mercancía: 1.5%
- Maniobras de descarga: (monto fijo)
- Viáticos supervisión: (monto fijo)
- Contingencia: 3%
```

---

## 🗄️ Modelo de Datos

### Nueva tabla: `project_expenses`

```sql
CREATE TABLE project_expenses (
    id SERIAL PRIMARY KEY,
    quote_id TEXT NOT NULL REFERENCES quotes(quote_id),
    concept VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    calculation_type VARCHAR(20) NOT NULL,  -- 'fixed' o 'percentage'
    value DECIMAL(15,4) NOT NULL,           -- monto fijo o porcentaje
    calculated_amount DECIMAL(15,4),        -- monto calculado
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT valid_category CHECK (category IN (
        'logistica', 'seguros', 'fianzas', 
        'administrativos', 'contingencias', 'financieros'
    )),
    CONSTRAINT valid_calc_type CHECK (calculation_type IN ('fixed', 'percentage'))
);
```

### Nueva tabla: `expense_templates`

```sql
CREATE TABLE expense_templates (
    id SERIAL PRIMARY KEY,
    template_name VARCHAR(100) NOT NULL,
    playbook VARCHAR(50),
    expenses JSONB NOT NULL,  -- Array de gastos predefinidos
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 📈 Flujo de Trabajo

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  1. Crear       │────▶│  2. Agregar     │────▶│  3. Agregar     │
│  Cotización     │     │  Líneas/Items   │     │  Gastos         │
└─────────────────┘     └─────────────────┘     │  Asociados      │
                                                └────────┬────────┘
                                                         │
                                                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  6. Guardar     │◀────│  5. Ajustar     │◀────│  4. Revisar     │
│  Versión        │     │  si necesario   │     │  Rentabilidad   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## ⚠️ Alertas y Validaciones

1. **Alerta de margen bajo**: Si el margen neto cae por debajo del umbral rojo del playbook
2. **Alerta de gastos excesivos**: Si los gastos asociados superan el 20% del ingreso
3. **Sugerencia de revisión**: Si el margen neto es significativamente menor al margen bruto (diferencia > 10 puntos)

---

## 🚀 Plan de Implementación

### Fase 1: MVP (Esta iteración)
- [ ] Crear estructura de datos para gastos
- [ ] Implementar UI de captura de gastos
- [ ] Calcular y mostrar nuevos KPIs
- [ ] Actualizar gráfico de distribución financiera
- [ ] Integrar con guardado de cotización

### Fase 2: Mejoras
- [ ] Plantillas de gastos por playbook
- [ ] Historial de gastos por proyecto
- [ ] Exportar a PDF con análisis de rentabilidad

### Fase 3: Avanzado
- [ ] Comparativo de rentabilidad entre versiones
- [ ] Análisis de escenarios (optimista/pesimista)
- [ ] Dashboard de rentabilidad histórica

---

## 📊 Ejemplo de Reporte Final

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                    ANÁLISIS DE RENTABILIDAD                               ║
║                    Cotización: COT-2026-001-v3                            ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                           ║
║  RESUMEN FINANCIERO                                                       ║
║  ─────────────────                                                        ║
║  Ingreso Total:          $100,000.00                                      ║
║  (-) Costo Directo:       $65,000.00                                      ║
║  ═══════════════════════════════════                                      ║
║  Utilidad Bruta:          $35,000.00    (35.00%)                          ║
║                                                                           ║
║  (-) Gastos Asociados:    $12,500.00                                      ║
║      • Logística:          $3,500.00                                      ║
║      • Fianzas:           $10,000.00                                      ║
║      • Seguros:            $1,500.00                                      ║
║      • Contingencias:      $2,500.00                                      ║
║  ═══════════════════════════════════                                      ║
║  UTILIDAD NETA:           $22,500.00    (22.50%)  🟢                      ║
║                                                                           ║
║  EVALUACIÓN: VERDE - Rentabilidad óptima según playbook "General"         ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

---

## ✅ Beneficios

1. **Visibilidad real**: Conocer la rentabilidad verdadera antes de cerrar el proyecto
2. **Mejor toma de decisiones**: Ajustar precios o alcance basado en datos reales
3. **Control de riesgos**: Identificar proyectos con márgenes insuficientes
4. **Profesionalismo**: Presentar análisis completo al cliente interno
5. **Histórico**: Aprender de proyectos anteriores para mejorar estimaciones

---

*Documento generado: 29 de enero de 2026*
*Versión: 1.0*
*Branch: rentabilidad*
