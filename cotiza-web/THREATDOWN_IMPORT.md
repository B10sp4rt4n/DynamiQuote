# Importación de partidas ThreatDown

«Importar PDF ThreatDown» toma únicamente SKU, cantidades y descripciones.
El usuario revisa las partidas y confirma el reemplazo en un borrador.
Costo, precio y margen comienzan en cero: los define después en el editor
normal de Cotiza. La importación no solicita tipo de cambio ni margen y no
arrastra precios o reglas comerciales desde el PDF.

Se conserva la detección de soporte como servicio. Sus partidas gratuitas
(costo y precio cero) pueden guardarse junto con productos con precio y margen,
sin impedir la edición de la cotización.

El lector admite cotizaciones digitales de ThreatDown Limited con Purchase
Summary en USD. Reconstruye filas y celdas monetarias partidas por coordenadas,
valida que la extracción esté completa y concilia las cifras del documento como
control de lectura. Esas cifras no se transfieren a las partidas de Cotiza.
Conserva descripciones de varios renglones. Rechaza tablas incompletas, SKU
repetidos, fechas inválidas o descuadres. No hace OCR. Límites: 3 MB y 10 páginas.
No necesita IA ni servicios adicionales.

POST /api/quotes/:quoteId/import-threatdown admite multipart con file y action.
preview no escribe. apply vuelve a leer el original y exige expectedHash,
operationId UUID y confirmed=yes. Ignora precios, tipo de cambio, margen y
partidas enviados por el navegador; usa exclusivamente la extracción del servidor.
Autentica tenant, verifica visibilidad del vendedor, capacidad habilitada por
empresa y límite de frecuencia. El escritor transaccional común permite reintentos
sin duplicar partidas. Llena v1 si es un borrador inicial vacío; en los demás
casos crea una versión y conserva la anterior y la oportunidad.

input_metadata.source conserva número de cotización del fabricante, SHA-256,
importMode=items-only y usuario que revisó. No guarda costos del fabricante,
margen, tipo de cambio, contactos ni bytes del PDF en esta operación.
Los originales y metadatos de importaciones anteriores se conservan.

Antes de generar una propuesta, el editor guarda cualquier cambio pendiente
en las partidas, aunque no altere el total de venta. Esto incluye costos,
descripciones, cantidades, clasificaciones y márgenes. Una falla de guardado
mantiene al usuario en el editor y evita crear la propuesta con datos anteriores.

No requiere migración. Node >=22; producción usa Node 24. Las suites incluyen
contrato, permisos, idempotencia, soporte gratuito y navegación a propuestas.
Las pruebas opcionales con PDF reales usan THREATDOWN_PDF_TEST_DIR; los
archivos privados no se incluyen en el repositorio.
