# CHANGELOG - DynamiQuote

## [2026-02-11] - Refactorización: Módulo QuoteState

### 🎯 Cambios Importantes
- ✅ **Nuevo módulo `quote/`** con gestión centralizada de estado (1,265 LOC)
- ✅ **QuoteState class** para operaciones de cotizaciones
- ✅ **14 tests unitarios** con 100% passing (pytest)
- ✅ **Validación consistente** con `ValidationError`
- ✅ **Cálculos centralizados** eliminando duplicación de código
- ✅ **Arquitectura híbrida** manteniendo compatibilidad backward

### 📦 Módulo Quote
**Estructura:**
```
quote/
├── __init__.py          # Exports públicos
├── state.py             # QuoteState class (424 LOC)
├── calculations.py      # Funciones financieras (187 LOC)
├── validators.py        # Validación uniforme (260 LOC)
└── README.md            # Documentación completa
```

**Funcionalidad:**
- `QuoteState`: Gestión centralizada de líneas de cotización
- `add_line()`: Agregar con validación automática
- `update_line()`: Actualizar con recálculo de márgenes
- `remove_line()`: Eliminar con verificación de índice
- `clear_lines()`: Limpiar cotización completa
- `calculate_totals()`: Totales financieros consistentes
- `ValidationError`: Excepción para errores de validación

### 🔧 Integración en app.py
**Secciones migradas a QuoteState:**
1. Inicialización de session_state (~línea 775-805)
2. Formulario agregar línea (~línea 1850-1890)
3. Confirmación de línea pendiente (~línea 1800-1820)
4. Cálculos de totales (~línea 1920-1960)
5. Edición vía data_editor (~línea 1998-2022)
6. Eliminación de líneas (~línea 2032-2040)
7. Limpiar cotización (~línea 2048-2056)
8. Carga desde versión anterior (~línea 1645)
9. Carga desde propuesta existente (~línea 1728)

**Funciones de sincronización:**
- `sync_quote_state_to_legacy()`: QuoteState → st.session_state.lines
- `sync_legacy_to_quote_state()`: st.session_state.lines → QuoteState

### 📊 Métricas de Mejora
| Métrica | Antes | Después | Mejora |
|---------|-------|---------|--------|
| Tests para lógica cotización | 0 | 14 | +∞ |
| Cálculos de margen duplicados | 5+ | 1 | -80% |
| Validación consistente | No | Sí | ✅ |
| Manejo de errores | Disperso | Uniforme | ✅ |
| Referencias st.session_state | 197 | 199* | N/A |
| Llamadas st.rerun() | 18 | 18** | N/A |

\* +2 por funciones sync (temporal)  
\** Todos validados como necesarios (ver RERUN_ANALYSIS.md)

### 📚 Documentación Nueva
- **quote/README.md**: Documentación completa del módulo
- **MIGRATION_GUIDE.md**: Guía de migración Legacy → QuoteState
- **RERUN_ANALYSIS.md**: Análisis exhaustivo de 18 st.rerun()
- **INTEGRATION_PROGRESS.md**: Progreso de integración por fases

### 🧪 Testing
```bash
pytest tests/test_quote_module.py -v
# ===== 14 passed in 0.04s =====
```

**Tests incluidos:**
- ✅ calculate_margin()
- ✅ calculate_price_from_margin()
- ✅ calculate_line_subtotals()
- ✅ calculate_quote_totals()
- ✅ validate_sku(), validate_description(), validate_quantity()
- ✅ validate_line()
- ✅ QuoteState initialization, add_line, remove_line
- ✅ QuoteState calculate_totals, derive_version
- ✅ QuoteState serialization (to_dict/from_dict)

### 🔄 Arquitectura Híbrida (Temporal)
**Estado dual mantenido durante transición:**
- `st.session_state.lines` (legacy, para renderizado)
- `st.session_state.quote_state` (moderna, para operaciones)

**Sincronización bidireccional:**
- Después de operaciones QuoteState: `sync_quote_state_to_legacy()`
- Antes de cálculos QuoteState: `sync_legacy_to_quote_state()`

**Motivo:** Compatibilidad con código legacy sin migrar (~5% de funcionalidad)

### 🐛 Análisis de Reruns
Se analizaron los 18 `st.rerun()` existentes:
- **Resultado:** Todos son necesarios (arquitectura Streamlit)
- **Distribución:** 44% gestión líneas, 28% confirmaciones, 11% cargas, 17% resets
- **Optimización:** Calidad mejorada (validación antes, cálculos centralizados)
- **Documentación:** Ver RERUN_ANALYSIS.md

### 🚀 Fases Completadas
- ✅ **Fase 1**: Crear módulo quote/ con QuoteState
- ✅ **Fase 2**: Integrar en app.py (9 secciones)
- ✅ **Fase 3**: Analizar y validar reruns
- ✅ **Fase 4**: Documentación y guías de migración

### 📝 Archivos Modificados
- **Nuevos:**
  - `quote/__init__.py`
  - `quote/state.py`
  - `quote/calculations.py`
  - `quote/validators.py`
  - `quote/README.md`
  - `tests/test_quote_module.py`
  - `MIGRATION_GUIDE.md`
  - `RERUN_ANALYSIS.md`
  - `INTEGRATION_PROGRESS.md`

- **Modificados:**
  - `app.py`: Integración en 9 secciones críticas

### 🎯 Beneficios Alcanzados
1. **Calidad:** Tests automatizados para lógica crítica
2. **Mantenibilidad:** Código más legible y modular
3. **Robustez:** Validación automática antes de operaciones
4. **Consistencia:** Cálculos centralizados sin duplicación
5. **Escalabilidad:** Fácil agregar nuevas validaciones/cálculos

### 🔮 Próximos Pasos (Opcional)
- **Fase 5**: Eliminar funciones sync una vez todo migrado
- **Fase 6**: Migrar código legacy restante (~5%)
- **Fase 7**: Usar quote_state.lines como única fuente de verdad

### Build
- **Build:** 2026-02-11-12:00
- **Branch:** refactor/legacy-state-management
- **Commits:** 23c9294, f6e290c, 3e6bd67, 53a2ec7, e9cbc67, 12dc315
- **Base:** feature/api-first-validation

---

## [2026-02-10] - Sistema de PDFs con ReportLab

### Cambios Importantes
- ✅ **Migración de WeasyPrint a ReportLab** para generación de PDFs
- ✅ **Eliminadas dependencias del sistema** (cairo, pango, gdk-pixbuf, etc.)
- ✅ **Compatible con Streamlit Cloud** sin configuración adicional
- ✅ **PDFs profesionales** con tablas, logos, totales y términos

### Funcionalidad
- Generación de propuestas formales en PDF
- Soporte para logos de emisor y cliente
- Cálculo automático de IVA (integrado o desglosado)
- Términos y condiciones personalizables
- Sección de firma digital

### Archivos Modificados
- `requirements.txt`: Agregado `reportlab>=4.0.0`
- `formal_proposal_generator.py`: Reescrita función `generate_proposal_pdf()`
- `app.py`: Actualizada verificación de disponibilidad

### Build
- **Build:** 2026-02-10-05:30
- **Branch:** feature/api-first-validation
- **Commit:** faa3341

### Testing
- ✅ Prueba local exitosa: PDF de 3.7KB generado correctamente
- ✅ Sin dependencias del sistema requeridas
- ✅ Compatible con Python 3.13

---

## Cambios Anteriores

### [2026-02-09] - Correcciones de Versioning y UI
- Fix: Sistema de versionado ahora usa `MAX(versions) + 1`
- Fix: Corrección de errores de indentación
- Fix: Validación de datos numéricos en gráficos
- Fix: Manejo de campos vacíos en `service_origin`
- Fix: Clarificación de "Componente" → "Origen de Servicio"
