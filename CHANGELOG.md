# CHANGELOG - DynamiQuote

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
