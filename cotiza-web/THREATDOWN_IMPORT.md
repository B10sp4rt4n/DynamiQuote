# Importación de cotizaciones ThreatDown

Desde el editor, «Importar PDF ThreatDown» permite leer una cotización digital,
revisar cliente destinatario, SKU, cantidades, costo neto USD y suscripción,
indicar un tipo de cambio MXN/USD y margen sobre venta, y confirmar un borrador.
No necesita IA, credenciales de correo ni servicios adicionales.

La primera versión acepta el formato de ThreatDown Limited con Purchase Summary
y precios en USD. La lectura reconstruye filas por coordenadas PDF y toma
exclusivamente Net Unit Price y Net Total Amount. Reconcilia extensiones y
subtotal; conserva las partidas de soporte de costo cero y las descripciones
que ocupan varias líneas. Falla ante tablas incompletas, otras monedas, SKU
repetidos, fechas inválidas o descuadres. No realiza OCR. Límite: 3 MB, 10 páginas.

El editor existente presenta importes en MXN. Por ello esta entrega requiere un
tipo de cambio explícito y crea importes en MXN, sin inferir ni consultar una
cotización cambiaria. Redondea cada costo convertido a centavos y calcula
venta = costo / (1 - margen / 100). No multiplica otra vez por el plazo: el
costo recibido corresponde al importe unitario de la suscripción del PDF.

La confirmación exige revisar la correspondencia del cliente, cantidades,
vigencia, plazo y precios. No vincula clientes automáticamente por nombre,
no modifica una propuesta ni crea aprobaciones o envíos. Crea una nueva versión
del grupo con las partidas del PDF y conserva la versión y oportunidad anteriores.
La versión resultante puede guardarse como plantilla con el botón existente.

POST /api/quotes/:quoteId/import-threatdown admite multipart con file y action.
preview no escribe. apply vuelve a leer el PDF original, exige expectedHash,
operationId UUID, exchangeRate, marginPct y confirmed=yes. No confía en partidas
enviadas por el navegador. Autentica tenant, verifica visibilidad del vendedor,
limita frecuencia y usa el escritor transaccional común para reintentos.

input_metadata.source conserva el número de cotización, SHA-256 del archivo,
los costos y cantidades originales en USD, fechas, plazo, carácter preliminar,
tipo de cambio, margen y usuario que revisó. No almacena los contactos,
direcciones del PDF ni sus bytes. El original debe conservarse por el usuario;
el hash permite contrastarlo. Una revisión nueva con el mismo número de
cotización se distingue por el hash del archivo.

No requiere migración adicional a la base publicada para plantillas. Requiere
Node 22 o posterior por unpdf 1.9.1; producción usa Node 24. No cambia el flujo
Excel ni la moneda de propuestas anteriores. La creación normal de propuestas
conserva su revisión comercial y selección de moneda existentes.

Validación: contrato, ruta y lectura con PDF reales de Selanusa Q-795488 y
DISTMAR Q-760396, guardados fuera del repositorio. La suite de PDF reales es
optativa con THREATDOWN_PDF_TEST_DIR; no contiene los documentos privados.
