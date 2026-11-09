# Revisión de CSF escaneadas

El mismo control Cargar CSF admite PDF con texto o escaneado. Digestor realiza OCR local cuando hace falta; Cotiza conserva upload firmado por usuario/tenant, revisión exacta, validación de formato/catálogos locales y Guardar como acción separada.

La pantalla indica cuando se leyó un escaneo y muestra avisos en los campos dudosos recibidos en `review.fieldWarnings`. Los campos se pueden corregir y cambiar un valor elimina el consentimiento anterior. Los errores de archivo/lector/límite son accionables y no exponen mensajes internos de Tesseract.

Publicar primero el backend con OCR y sus idiomas; después esta interfaz. El contrato es aditivo: los documentos anteriores y respuestas sin metadatos OCR mantienen la revisión habitual.

Pruebas: banner y avisos, consentimiento obligatorio y mensajes de error. Los casos de escaneo se generan en el repositorio de Digestor con datos sintéticos; no se requieren CSFs reales para avanzar.
