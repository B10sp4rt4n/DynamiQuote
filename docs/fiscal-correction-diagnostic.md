# Diagnóstico de conciliación de sustituciones fiscales

En la sección **Corregir y sustituir factura/complemento**, cuando existe historial,
**Descargar diagnóstico de conciliación** descarga un JSON para revisar una operación
con el PAC. La descarga sólo consulta el estado guardado en Digestor; no consulta
al PAC, no timbra, no solicita cancelación y no modifica el expediente.

Se usa el GET existente de corrección con `?format=diagnostic`. Conserva la
autorización fiscal, el tenant y la visibilidad de propuesta de esa ruta. El borrador
se resuelve en el servidor. `revision` permite seleccionar únicamente una revisión
del historial autorizado; una revisión ajena devuelve 404. No incluye correcciones
descartadas sin emitir.

El contrato `cotiza.fiscal-correction-diagnostic`, versión 1, incluye:

| Campo | Significado |
| --- | --- |
| `generated_at` | Fecha de descarga; no es la fecha de envío al PAC. |
| `environment` | Ambiente determinado por el contexto autenticado. |
| `proposal_id`, `draft_id`, `payment_id` | Referencias internas; pago nulo para factura. |
| `kind`, `active_uuid`, `pending` | Estado vigente guardado en Cotiza/Digestor. |
| `revisions[].revision_id` | Identificador interno de corrección. |
| `revisions[].pac_reference` | `IdComprobante` determinista: `revision-` + ID, según el adaptador de timbrado vigente. No demuestra que el PAC haya recibido el intento. |
| `revisions[].status`, `source_cancellation_status` | Estados guardados de sustitución y cancelación anterior. |
| `revisions[].source_uuid`, `result_uuid` | UUID original y sustituto confirmado, si existe. |
| `revisions[].request_xml_sha256` | SHA-256 de los bytes del XML preparado decodificado de base64, o nulo si no está disponible. No es el hash del XML timbrado. |

Se utiliza una lista explícita de campos. Se excluyen XML, CSD, credenciales,
importes, RFC, datos del receptor, cambios y motivos de texto libre. El archivo
contiene referencias fiscales e internas: su descarga no autoriza compartirlo
con terceros. Se sirve como adjunto JSON con `Cache-Control: no-store` y `nosniff`.

Si el resultado es `unknown` o `processing`, se debe confirmar el UUID o el
resultado definitivo con el PAC antes de resolver el caso. Este archivo no
convierte una solicitud incierta en rechazada, no habilita un nuevo timbrado y
no sustituye la recuperación y validación del XML. En una cancelación incierta
se conserva la consulta de confirmación existente.
