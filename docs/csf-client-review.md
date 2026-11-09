# CSF: carga, revisión y aplicación al cliente

Clientes → Nuevo/Editar → Cargar CSF → revisar PDF y campos → confirmar y aplicar → Guardar.

La carga se muestra únicamente cuando `isDigestorFiscalEnabledForTenant` habilita el tenant activo. Usa la conexión existente; no añade servicios ni claves. El PDF original se almacena en Digestor al cargarlo. La ficha de Cotiza se modifica sólo mediante el Guardar existente; la confirmación devuelve valores revisados y no aprueba outbound, factura, timbra ni envía mensajes.

## Contrato y controles

- `POST /api/clients/csf` multipart: PDF original con texto, máximo 4 MiB, límite de stream y firma `%PDF-`. Envía `use_ai=false` a Digestor. Devuelve token firmado para el job.
- `GET /api/clients/csf`, header `X-CSF-Review`: token con vigencia de 30 minutos, ligado a tenant, usuario y job. No acepta IDs arbitrarios de Digestor. Devuelve estados y `review` al terminar; respuestas sin caché.
- `POST /api/clients/csf` JSON: `{token, expectedRevision, confirm:true, values}`. Reconsulta la fuente, rechaza revisión obsoleta y verifica formato/catálogos mediante `/v1/receptor/validate` con `pacCheck=false`. Devuelve valores para el formulario, sin guardar el cliente.
- El panel muestra valor actual, extracción original y propuesta editable. Las sugerencias IA requieren selección. Cambiar una propuesta elimina el consentimiento anterior. Un RFC distinto al del cliente genera advertencia.
- Guardar queda bloqueado durante una revisión pendiente. Descartar devuelve a captura manual sin aplicar los valores. Errores de consulta permiten reintentar sin volver a subir el PDF. Al cerrar el formulario se cancelan solicitudes y se libera la vista local del archivo.

## Integración y límites

Publicar primero el cambio de Digestor que expone `GET /csf/{id}.review`; después Cotiza. Si falta el contrato, el panel informa que se requiere actualizar Digestor. No requiere migración de BD.

El chequeo usa reglas/catálogos locales; no certifica autenticidad del documento ni situación vigente ante SAT. OCR, conciliación de perfiles/versiones y aprobación de correcciones en Digestor quedan fuera de esta entrega. Las correcciones editadas aquí se aplican a la ficha de Cotiza; no modifican el PDF ni los hechos extraídos de Digestor.

## Validación

- TypeScript: `npx tsc --noEmit --incremental false`.
- Pruebas específicas: API de carga/alcance/revisión, panel y recorrido completo de Clientes (sin aplicación ni guardado automático, consentimiento, sugerencias y Guardar separado).
- Regresión: `npx vitest run --exclude validate-quote-lifecycle.e2e.test.ts`. Se excluye el recorrido existente que requiere una BD real; no se utilizan credenciales productivas.
- ESLint en archivos nuevos e integración: aprobado. `client-shell.tsx` conserva una infracción previa en el efecto de sincronización de logos, ajena a este cambio.
- Comprobación visual pendiente: Chromium local no pudo iniciar por la restricción de sockets del entorno; el navegador compartido no pudo acceder al servidor local. El recorrido de interfaz se verifica con React/jsdom, con API simulada; Digestor prueba por separado handlers HTTP, parser y persistencia real en SQLite temporal.
