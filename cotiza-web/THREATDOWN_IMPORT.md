# Importación de cotizaciones ThreatDown

«Importar PDF ThreatDown» permite revisar SKU, cantidades, descripciones y
costos netos antes de confirmar el reemplazo en un borrador. La interfaz ofrece
importar el **NET UNIT** de cada partida, activado inicialmente, o desmarcarlo
para importar únicamente partidas con costo y precio en cero.

En cada importación con costos se elige USD o MXN. USD conserva el costo neto
del documento. MXN exige capturar cuántos pesos equivalen a un dólar; no se
consulta ni inventa un tipo de cambio. Cada costo unitario convertido se
redondea a dos decimales antes de multiplicarlo por la cantidad. La vista previa
muestra costo original, costo convertido y total para revisar. No usa MSRP,
descuento ni precio sugerido como precio de venta. El precio de venta empieza
en cero y el usuario define después margen o precio en el editor normal.

La moneda queda ligada a esa versión de cotización y se conserva en revisiones
manuales y posteriores importaciones ordinarias. Los importes de esa versión
se muestran con su moneda; no se comparan versiones con monedas explícitas
distintas. La propuesta nueva hereda esa moneda y exige precio de venta en
partidas con costo positivo. El soporte gratuito (costo y precio cero) continúa
permitido. Cambiar sólo la etiqueta de moneda de una propuesta importada se
rechaza: para convertir se debe volver a importar el PDF y revisar el tipo de
cambio. Las cotizaciones anteriores sin moneda explícita conservan su flujo.

El lector admite cotizaciones digitales de ThreatDown Limited con Purchase
Summary en USD. Reconstruye filas y celdas monetarias partidas por coordenadas,
valida la extracción y concilia las cifras como control de lectura. Conserva
descripciones de varios renglones. Rechaza tablas incompletas, SKU repetidos,
fechas inválidas o descuadres. No hace OCR. Límites: 3 MB y 10 páginas. No
necesita IA ni servicios adicionales.

El lector entrega una copia de los bytes a PDF.js, que transfiere su buffer al
worker. El original permanece intacto para guardar evidencia y calcular el mismo
SHA-256 usado en la revisión. Las regresiones usan un PDF digital sintético real.
Guardar el PDF como evidencia comercial sigue siendo una opción independiente,
desmarcada inicialmente y sujeta a la capacidad habilitada para el tenant.

Una relectura invalida la vista previa anterior hasta obtener una nueva lectura
válida. Los errores distinguen lectura e importación. Una respuesta incierta se
recupera con la misma clave de operación, conservando moneda, tipo de cambio y
consentimiento de evidencia, incluso al releer el mismo archivo. No se duplican
partidas ni se atribuyen errores de guardado a una contraseña.

POST /api/quotes/:quoteId/import-threatdown admite multipart con file y action.
preview no escribe. apply vuelve a leer el original y exige expectedHash,
operationId UUID y confirmed=yes. includeCosts=yes requiere costCurrency=USD y
exchangeRate=1, o costCurrency=MXN y exchangeRate positivo, finito y <=10000.
Sin includeCosts=yes mantiene el contrato anterior de sólo partidas. Ignora
costos, precios, márgenes y partidas enviados por el navegador: obtiene las
partidas y costos exclusivamente del PDF leído por el servidor y valida la
conversión. Autentica tenant, visibilidad del vendedor, capacidad por empresa y
límite de frecuencia. El escritor transaccional permite reintentos sin duplicar.
Llena v1 si es un borrador inicial vacío; en otros casos crea una versión y
conserva la anterior y su oportunidad. No actualiza retroactivamente versiones
que ya habían importado costo cero.

input_metadata conserva moneda comercial, número de cotización del fabricante,
SHA-256, importMode (items-only o items-with-costs), usuario que revisó y, si se
incluyen costos, moneda origen USD, moneda elegida y tipo de cambio. Las
partidas resueltas conservan los costos aplicados. Los bytes se guardan sólo
cuando se solicita evidencia. Una revisión manual conserva la moneda sin copiar
la clave de operación de una importación anterior.

Antes de generar una propuesta, el editor guarda cambios pendientes en partidas,
incluso cuando no alteran el total de venta. Esto incluye costos, descripciones,
cantidades, clasificaciones y márgenes. Una falla de guardado mantiene al usuario
en el editor y evita crear la propuesta con datos anteriores.

No requiere migración. Node >=22; producción usa Node 24. Las suites incluyen
lectura de PDF, conversión y redondeo, permisos, idempotencia, moneda de propuesta,
soporte gratuito y edición de margen. Las pruebas opcionales con PDF privados
usan THREATDOWN_PDF_TEST_DIR; no se incluyen datos de clientes en el repositorio.
