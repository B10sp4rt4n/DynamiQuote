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
- Sustitución desde Cotiza: generar/vincular comprobante sustituto y relación04, seleccionar su propuesta en el mismo tenant y cancelar con motivo01. El motor valida una sustituta ya timbrada y relacionada; el frontend bloquea IDs/UUID arbitrarios y no ofrece este recorrido incompleto.
- Corrección/sustitución de REP y reversión/reasignación de aplicaciones. No se borra un pago para hacer coincidir un saldo fiscal.
- Factura con pagos: se bloquea su cancelación hasta resolver los documentos y aplicaciones. No existe todavía el asistente completo de resolución.
- Revisión de interfaz con sesión real y versión desplegada, mantenimiento/migraciones/respaldo y autorización de liberación.

Los perfiles de otras monedas, anticipos, retenciones, pagos agrupados y factura global permanecen fuera del primer perfil y se rechazan explícitamente.
