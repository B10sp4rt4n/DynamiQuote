# Autorización, envío y resultado comercial

## Problema y comportamiento corregido

La pantalla cambiaba localmente approved a sent después de enviar el PDF. El servidor también podía autorizar después del envío o convertir una aceptación del cliente en autorización interna. Esto mezclaba tres datos distintos y mostraba estados que no coincidían con la autorización persistida.

El flujo queda así:

| Eje | Datos visibles | Regla |
| --- | --- | --- |
| Autorización interna | Borrador, En revisión, Autorizada, Rechazada, Vencida | Es el estado del flujo interno. |
| Envío del PDF | Sin registro / fecha de envío registrado | Es metadata de entrega; nunca sustituye la autorización. |
| Resultado comercial | Sin cierre, Ganada, Perdida, Descartada | Se registra por separado, con fecha de cierre; nunca autoriza. |

Por defecto, el botón envía el PDF al vendedor y copia al owner. El habilitador “Habilitar envío al contacto del cliente” está apagado por defecto y se reinicia al cambiar de propuesta. Al activarlo, el destinatario principal es el contacto guardado y se copia al owner y al emisor formal (con fallback al usuario autenticado si no hay correo formal). El servidor exige los tres correos válidos y no acepta direcciones arbitrarias del body. Deduplica direcciones y excluye de CC a quien ya esté en Para. El cliente recibe un mensaje comercial con respuesta al emisor. El registro del proveedor no acredita recepción ni aceptación del cliente. La UI lo explica. Enviar/re-enviar conserva approved (visible como Autorizada), también en filtros y contadores. Elegibilidad por margen y un forzamiento de PDF no sustituyen una autorización ya registrada para enviar correo. El usuario debe completar primero el flujo de autorización; los mecanismos existentes de autorización por política o excepción siguen disponibles por sus rutas propias.

Se elimina la transición manual a sent y el privilegio implícito que atribuía una autorización a un envío histórico. Ganada/Perdida requieren estado autorizado y no lo cambian. Se retiran los botones de “Cliente aceptó/rechazó” que alteraban el estado interno y se remite al registro comercial existente en detalle/Pipeline.

## Registro y versiones

Se reutiliza formal_proposals.sent_at, sin migración. Sólo se registra tras aceptación del proveedor de correo. Se guarda evento document_issued con destinatario funcional (vendedor/owner o cliente/owner/emisor), direcciones Para/CC efectivas, ID del proveedor, documento y huella SHA-256 del PDF exacto, sin cambiar estado ni fabricar aprobaciones.

Antes de llamar al proveedor se comprueba nuevamente autorización, tenant y revisión, después de renderizar el PDF. Al registrar se bloquea la propuesta y se compara la revisión renderizada con su updated_at original; si cambió durante el envío, se conserva el acto histórico y no se marca enviada la revisión nueva. No se mantiene una transacción de base durante la llamada externa. Esto no es una cola/outbox ni elimina todo intervalo entre comprobación y aceptación externa.

Un fallo de proveedor no marca enviada. Si el proveedor aceptó y falla la escritura posterior, la respuesta advierte que no se repita por ese aviso; no dispara otro envío. No se implementó recuperación automática del proveedor ni garantía exactly-once. Al guardar contenido/reabrir, se limpia el marcador de envío de la revisión actual; la evidencia anterior permanece en la bitácora cuando fue registrada.

## Registros anteriores

El código sent se conserva para lectura compatible y se muestra “Autorización por verificar”. Sus contadores identifican registros anteriores, no un estado alternativo al autorizado. No se convierten masivamente en autorizados: el código histórico podía alcanzarse sin aprobación. Se requiere revisar/autorizarlos con las reglas vigentes antes de volver a enviar o registrar Ganada/Perdida. No se ejecutaron cambios sobre datos reales.

Las etiquetas son coherentes en propuestas, detalle, portada, cliente, KPIs y sus PDF. No se declara que “Enviadas” sea un conteo de entregas: el contador legado sent describe exclusivamente filas antiguas por revisar. Una propuesta autorizada con excepción de margen no se muestra simultáneamente como bloqueada.

## Verificación y alcance de entrega

Pruebas de gate y handler usan proveedor y PDF simulados: ningún correo real. Cubren bloqueo sin autorización incluso con margen elegible/forzamiento, propuesta ajena, cambio de revisión durante render, envío aceptado, fallo del proveedor y fallo al guardar tras aceptación. Pruebas de base descartan cambios de estado/aprobaciones, comprueban sent_at independiente, aislamiento de empresa, revisión obsoleta y que Ganada no autorice un sent heredado. Se ejecutan compilación TypeScript, suite general y el arnés de PostgreSQL descartable.

Cambio en rama separada sobre la base multitenant PR28, independiente del trabajo de PPD. Se entrega como borrador de revisión: no fusionado, sin despliegue ni correos reales.
