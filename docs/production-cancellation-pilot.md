# Cancelación fiscal productiva: piloto limitado

El administrador de la empresa emisora puede solicitar y consultar la cancelación de un único CFDI real revisado previamente. El UUID autorizado se configura en `DIGESTOR_FISCAL_LIVE_CANCEL_UUID`; no se incluye en el código ni en este repositorio público. La integración reutiliza usuario/contraseña privados existentes de Digestor sin leerlos ni cambiarlos.

La ruta nueva requiere identidad Clerk, rol owner/admin/superadmin, tenant con capacidad fiscal, visibilidad de la propuesta y el UUID configurado. Para POST exige Origin del propio sitio y un cuerpo estricto. Resuelve draftId y UUID en servidor; no admite IDs de servicio, tenant, emisor ni motivo arbitrarios del navegador. La confirmación explícita corresponde al motivo03 de la operación no realizada, declarado por el usuario para su comprobante de prueba.

El panel distingue emisión histórica, solicitud en proceso, resultado incierto, acuse y cancelación confirmada por el SAT. Si se pierde una respuesta sólo presenta consulta, sin reenvío automático. Los dobles clics se deduplican en interfaz; Digestor conserva la reserva durable y la evidencia. El PDF marca cancelación pendiente o confirmada según el registro fiscal. No se modifica el XML original, importes ni resultado comercial.

Depende de las rutas `/v1/billing/drafts/{draft_id}/production-cancellation` y `/reconcile` de Digestor, y sus dos tablas aditivas de auditoría. La interfaz debe publicarse después de verificar el backend. Desactivar la capacidad detiene solicitudes futuras; no revierte una cancelación fiscal ya confirmada.

Validación: tests del proxy para sesión/rol/tenant/Origin/UUID/payload y derivación del destino, TypeScript, suite de Cotiza y compilación. El ensayo productivo se acredita exclusivamente con su respuesta real y consulta al SAT.
