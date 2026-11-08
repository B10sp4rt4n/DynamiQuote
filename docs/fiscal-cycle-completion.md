# Ciclo fiscal: PPD, REP y cancelaciones

## Entrega

Incremento funcional apilado sobre Cotiza PR36 (`a817fed`) y coordinado con Digestor PR4 (`2ba5247`). Conserva su alcance inicial: MXN/IVA16, una factura por pago, captura PPD/99 y activación sólo para pruebas. No reemplaza PR28/34/35 ni fusiona la rama comercial productiva.

- PDF del REP desde el XML timbrado: importe recibido, documento relacionado, parcialidad y saldos, UUID, sellos y QR. Distingue el total cero del CFDI P del importe cobrado. Si el complemento está cancelado se imprime esa condición.
- Recuperación de `processing/unknown`: el operador proporciona el UUID confirmado por el proveedor; Digestor recupera el XML por una consulta y compara el contenido completo con la solicitud original. No envía otro timbrado ni registra otro cobro.
- Cancelación de factura y REP: captura motivos02/03 con confirmación explícita en pruebas, clave estable, acuse descargable y consulta separada del estado fiscal. Un HTTP200 o acuse de solicitud nunca confirma por sí solo la cancelación.
- Cancelar un REP conserva su cobro económico. Se bloquea emitir parcialidades posteriores cuando sus antecedentes tienen cancelación pendiente/confirmada. Los REP se resuelven en orden inverso; una factura con pagos no se cancela automáticamente.
- Rutas con sesión, capacidad del tenant y visibilidad de vendedor/administrador. `draftId` se resuelve desde la factura local; no se acepta desde el navegador. Las consultas y descargas usan no-store.

## Configuración y dependencias

`DIGESTOR_FISCAL_PPD_ENABLED` y `DIGESTOR_FISCAL_CANCELLATION_ENABLED` permanecen apagados por defecto. El motor exige sus propios flags y valida el destino HTTPS sandbox. Desplegar coordinadamente la contraparte y su migración revisada antes de activar el piloto aislado. No se aplicaron migraciones, configuraciones ni timbres a producción.

## Validación

La evidencia exacta de pruebas del commit final se conserva en el PR. Se comprobaron:

1. Suite Vitest, TypeScript y compilación Next con configuración sintética.
2. Permisos para las rutas nuevas, inyección de identificadores, errores sin reintento y PDF desde XML.
3. Integración HTTP real entre este cliente y el fixture FastAPI de Digestor: factura PPD timbrada sintética → pago58 → REP1 → pago58 → respuesta perdida → recuperación REP2 → saldo0 → PDF → cancelación de REP2 conservando cobros; factura sin pagos → solicitud → confirmación; una sola operación ante reintentos.
4. Renderizado e inspección visual del PDF sintético.

La navegación manual de los componentes quedó bloqueada: Chromium local falló por sockets Unix no permitidos; el navegador compartido no pudo alcanzar el servidor loopback (`ERR_CONNECTION_REFUSED`). El script `scripts/check_fiscal_cycle_ui.mjs` permite reproducir la revisión en un entorno con Chromium y Playwright disponibles, con respuestas HTTP sintéticas; no constituye una validación de sesión Clerk ni del PAC.

### Reproducir integración entre repositorios

En la rama correspondiente de Digestor: `.venv/bin/python scripts/run_fiscal_cycle_fixture.py --port 8769`. Este servidor usa datos en memoria, JWT sintético y proveedor simulado; prohíbe llamadas externas. No desplegarlo.

En cotiza-web: `FISCAL_CYCLE_FIXTURE_URL=http://127.0.0.1:8769 npm test -- lib/integrations/fiscal-cycle.integration.test.ts`. El test sólo admite loopback y comprueba la marca synthetic del fixture. Se omite por defecto para no alcanzar servicios ajenos.

### Reproducir interfaz aislada

Usar instalaciones temporales de esbuild y Playwright; no son dependencias productivas nuevas. Variables opcionales: `ESBUILD_MODULE`, `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, `FISCAL_UI_SCREENSHOTS`. Ejecutar `node scripts/check_fiscal_cycle_ui.mjs`. Para revisión manual, `FISCAL_UI_SERVE_ONLY=true` imprime una URL efímera de prueba.

## Pendientes que impiden declarar completo el MVP fiscal

- Firma/CSD, identidad y aceptación efectiva del PAC sandbox; matriz fiscal y vigencia aplicable. Las pruebas con proveedor simulado no certifican aceptación fiscal.
- Ampliar la sustitución a cambios económicos o de RFC y a facturas con pagos. El primer perfil de metadatos y forma/método ya tiene recorrido guiado, conserva economía y bloquea IDs ajenos.
- Ampliar la corrección de REP a importes o parcialidades anteriores y resolver reversión/reasignación de aplicaciones. El primer perfil ya corrige forma/referencia del último REP sin borrar el pago.
- Factura con pagos: se bloquea su cancelación hasta resolver los documentos y aplicaciones. No existe todavía el asistente completo de resolución.
- Revisión de interfaz con sesión real y versión desplegada, mantenimiento/migraciones/respaldo y autorización de liberación.

Los perfiles de otras monedas, anticipos, retenciones, pagos agrupados y factura global permanecen fuera del primer perfil y se rechazan explícitamente.

## Ampliación: sustituciones y correcciones conservando importes

Se agrega el recorrido guiado de cuatro pasos: revisar corrección → emitir sustituta → solicitar cancelación del anterior con motivo01 → consultar confirmación. La sustituta lleva relación04 al comprobante anterior. El original y sus XML siguen disponibles; el comprobante nuevo sólo se adopta como activo cuando la cancelación anterior está confirmada. El PDF de sustitución muestra la relación fiscal y UUID de origen.

Alcance funcional del primer perfil:

- Factura sin pagos registrados: corregir nombre, código postal, régimen/uso fiscal del receptor y método/forma de pago, conservando RFC, partidas, impuestos y total. El motor conserva una cadena para sustituciones sucesivas; los pagos posteriores se vinculan al UUID activo.
- Último REP: corregir forma de pago y referencia fiscal, conservando fecha, importes, saldos, factura relacionada y el pago económico original. Una corrección pendiente bloquea la emisión fiscal posterior. Al confirmarse la cancelación anterior puede continuar la siguiente parcialidad.
- Resultado incierto: recuperar el XML por UUID confirmado en el proveedor, sin reemisión. Una corrección preparada o rechazada puede descartarse antes de emitir; su evidencia queda conservada y visible.
- Nueva guarda `DIGESTOR_FISCAL_CORRECTIONS_ENABLED=false`. Las consultas de evidencia autorizadas permanecen separadas de las mutaciones. Coordinar con Digestor, `FISCAL_CORRECTIONS_ENABLED`, flags PPD/REP/cancelación y migración20261107_02 antes de cualquier piloto.

Se probaron interacciones reales del componente React en JSDOM: edición, confirmaciones por paso y deduplicación de doble clic. No equivale a revisión visual de navegador ni a una sesión Clerk real. Script: `scripts/check_fiscal_correction_dom.mjs`, con esbuild/jsdom instalados sólo como herramientas temporales de desarrollo.

La integración adicional `fiscal-correction.integration.test.ts`, con `FISCAL_CORRECTION_FIXTURE_URL` de loopback y un fixture recién iniciado, recorre sustitución de factura y REP, adopción del UUID nuevo, conservación del XML anterior y del cobro, PDF y liquidación posterior. El proveedor permanece simulado.

La revisión actual de Railway mostró únicamente el entorno production del servicio Digestor. La conexión OAuth sólo expone nombres de variables y no permitió verificar/usar una credencial o CSD de pruebas; no se trató el token genérico como sandbox ni se modificó producción. Sigue pendiente el ensayo de firmado/aceptación real del PAC con configuración segura verificada.

Cambios de RFC, cantidades, precios, tasas, importes de cobros, reasignación/reversión de pagos y corrección de parcialidades anteriores requieren su propio flujo y permanecen bloqueados. No se declara completo todo el sistema de facturación por este primer perfil.
