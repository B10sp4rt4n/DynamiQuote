# Clasificación SAT asistida por partida

La prefactura ofrece el recorrido: declarar qué se vende, buscar producto o
servicio y unidad en el catálogo oficial, revisar ambas descripciones y confirmar
la clasificación. La búsqueda usa texto y relaciones comerciales explicables en
Digestor Fiscal; no necesita un modelo, embeddings ni servicios de pago.

Comprar ThreatDown al fabricante extranjero no asigna una clave de venta.
El usuario distingue licencia, servicio administrado, implementación, soporte,
equipo u otra operación. El uso CFDI del receptor es independiente.

## Controles

- Tenant fiscal habilitado, identidad y visibilidad de la propuesta obligatorios.
- Cada confirmación registra tenant, actor, propuesta, partida, huella de la
  revisión, naturaleza, claves y versión del catálogo en proposal_audit_events.
- El servidor exige el recibo de confirmación y su versión para cada partida;
  omitirlos, alterar sus claves o reutilizar otra identidad/revisión se rechaza.
- Una actualización del catálogo exige nueva revisión; no se mezclan versiones.
- Antes de crear la prefactura se valida existencia y vigencia en Digestor.
- La memoria es por empresa, SKU (o descripción exacta sin SKU), naturaleza y
  duración. Se ofrece como candidata y siempre requiere una nueva confirmación.
- Editar una selección bloquea la generación y el timbrado hasta revisar y
  regenerar. No se actualizan XML históricos ni documentos ya emitidos.
- Un bloqueo síncrono por operación impide que dos clics rápidos dupliquen la
  confirmación o la creación de prefactura en el mismo panel. Se libera al
  finalizar también si la operación falla; no sustituye los controles del servidor.
- Se mantiene el perfil nacional MXN/IVA16 y las restricciones fiscales actuales.

El snapshot inicial de Digestor contiene 52,513 productos/servicios y 2,418
unidades; archivo SAT del 2026-11-06, consultado el 2026-11-08. La fuente y
fecha aparecen en el selector. El mantenimiento es por snapshot revisado y
publicado; la aplicación no descarga actualizaciones silenciosas del SAT.

## Validación y publicación

904 pruebas aprobadas y 60 omitidas por sus condiciones externas; se excluyó
validate-quote-lifecycle.e2e.test.ts, que depende de base real. TypeScript y
ESLint de los archivos nuevos/modificados aprobados. Incluye revisión explícita,
memoria aislada, consultas obsoletas, permisos y bloqueo de solicitudes directas
sin recibo. Los servicios fiscales y persistencia están simulados en estas pruebas.

La continuación añade cuatro recorridos integrados en
`fiscal-classification-flow.test.tsx`: panel React real → handlers de API reales
→ registro y verificación reales del recibo, con autenticación, almacenamiento y
Digestor/PAC sustituidos por dobles aislados. Cubren doble clic en confirmación y
generación, bloqueo de timbrado tras editar claves, memoria como candidata,
cambio de versión del catálogo y reintento después de errores. La prueba de doble
clic reprodujo dos solicitudes antes de corregir ambos botones.

Comando de regresión: `npx vitest run --maxWorkers=2 --exclude
'**/validate-quote-lifecycle.e2e.test.ts'`. Una ejecución sin límite de workers
agotó el plazo de dos suites del cotizador y produjo seis fallos en cascada;
la ejecución completa con dos workers aprobó las 904 pruebas sin ampliar
tiempos límite ni modificar esas suites. TypeScript y ESLint de los tres
archivos TSX de esta continuación también aprobaron.

La vista previa Vercel del commit 339fe5e está READY. Se verificó acceso mediante
Clerk/GitHub y SynAppsSys, pero el panel fiscal permanece oculto: las variables
DIGESTOR_FISCAL_BASE_URL/USERNAME/PASSWORD/TENANT_ID están limitadas a Producción.
El backend del catálogo sigue siendo dependencia de publicación. Esta revisión
no confirma un recorrido fiscal conectado en Preview.

`scripts/check_fiscal_classification_ui.mjs` usa los componentes reales del
panel y sus estilos, con respuestas HTTP sintéticas y bloqueo de toda salida
externa. Comprueba candidatos, confirmación explícita, doble clic, creación de
prefactura, invalidación por edición, rechazo de catálogo cambiado y desbordamiento
horizontal a 1360 y 390 px; captura cuatro estados por tamaño. No pulsa Timbrar.
El job classification-visual de fiscal-cycle.yml lo ejecuta en GitHub y conserva
capturas y result.json como artefacto fiscal-classification-visual durante 3 días.
El resultado del job determina si esta comprobación aprobó; la aceptación
integrada con Digestor real se verifica por separado después de publicarlo.

Orden: publicar Digestor feat/sat-catalog-search-aup, verificar /status, /search
y /validate con sesión autorizada, y luego publicar Cotiza. El frontend nuevo
depende de esas rutas. Sin migración ni variables nuevas. Las ramas quedan para
revisión; no implican autorización de despliegue ni operaciones fiscales reales.
