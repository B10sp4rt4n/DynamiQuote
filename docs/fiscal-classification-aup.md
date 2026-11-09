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
- Se mantiene el perfil nacional MXN/IVA16 y las restricciones fiscales actuales.

El snapshot inicial de Digestor contiene 52,513 productos/servicios y 2,418
unidades; archivo SAT del 2026-11-06, consultado el 2026-11-08. La fuente y
fecha aparecen en el selector. El mantenimiento es por snapshot revisado y
publicado; la aplicación no descarga actualizaciones silenciosas del SAT.

## Validación y publicación

900 pruebas aprobadas y 60 omitidas por sus condiciones externas; se excluyó
validate-quote-lifecycle.e2e.test.ts, que depende de base real. TypeScript y
ESLint de los archivos nuevos/modificados aprobados. Incluye revisión explícita,
memoria aislada, consultas obsoletas, permisos y bloqueo de solicitudes directas
sin recibo. Los servicios fiscales y persistencia están simulados en estas pruebas.

La comprobación visual en escritorio y móvil sigue pendiente: el navegador
automatizado no pudo iniciar por restricciones de sockets y el navegador
compartido no pudo acceder al servidor local. No se presenta esta comprobación
como realizada.

Orden: publicar Digestor feat/sat-catalog-search-aup, verificar /status, /search
y /validate con sesión autorizada, y luego publicar Cotiza. El frontend nuevo
depende de esas rutas. Sin migración ni variables nuevas. Las ramas quedan para
revisión; no implican autorización de despliegue ni operaciones fiscales reales.
