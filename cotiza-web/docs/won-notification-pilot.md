# Avisos de oportunidad ganada

La rama implementa captura JSON, bandeja interna y cola de correo con el Resend
que ya usa Cotiza. Los canales nuevos están desactivados por defecto. Este cambio
no activa SynAppsSys, no modifica su cuenta real y no envía correos por sí solo.

## Publicación y configuración

Aplicar, en este orden, las migraciones revisadas antes de habilitar los flags:

1. `prisma/manual/20261107_won_notifications.sql`
2. `prisma/manual/20261107_won_delivery.sql`

Ambas son aditivas e idempotentes. No rellenan cierres, destinatarios ni envíos
históricos. No usar `db push` contra producción para sustituir estas migraciones.

Los tres flags requieren el valor exacto `true`:

| Variable | Efecto |
| --- | --- |
| `COTIZA_WON_EVENT_PILOT` | Captura el evento al entrar en ganada; habilita la configuración y exportación. |
| `COTIZA_WON_IN_APP_ENABLED` | Publica un aviso por evento/usuario y habilita `/notificaciones`. |
| `COTIZA_WON_EMAIL_ENABLED` | Encola y procesa correo. Requiere remitente/credenciales existentes y URL pública válida. |

Los canales también requieren la captura activa y la política del tenant. Los
flags de canal apagados no consultan las nuevas tablas. Los eventos creados con
canales apagados no se convierten retroactivamente en envíos al encenderlos.

En la ficha del negocio, un owner/admin del tenant o superadmin configura al
responsable y otros usuarios designados. La pantalla muestra qué canales están
activos y permite revisar el mensaje por destinatario y descargar el JSON. Un
designado debe seguir teniendo acceso al documento: la designación no le da permisos.

Para SynAppsSys se verificó en lectura la existencia de la cuenta activa correcta.
La otra cuenta del mismo correo pertenece a un tenant diferente y no se incorpora.
No incluir datos personales de esas cuentas en este repositorio público.

## Recorrido de aceptación

1. Usar una base aislada, tenant e identidades sintéticos; no cerrar negocios
   comerciales reales para probar. Aplicar las dos migraciones dos veces.
2. Activar captura y aviso interno. Seleccionar al mismo usuario como responsable
   y designado administrativo. Registrar una propuesta autorizada como ganada.
3. Confirmar un aviso con ambos motivos; marcarlo leído y repetir esa operación.
4. Para probar correo, usar un receptor local simulado (`RESEND_BASE_URL` del SDK),
   una clave ficticia, remitente/destinatarios sintéticos y URL local. Nunca reutilizar
   credenciales de producción en esa prueba.
5. Simular fallo 503, reintentar y verificar el mismo sobre y clave, una sola
   aceptación y dos intentos registrados. Repetir procesamiento después del éxito.
6. Repetir cierre, corregir fecha, probar otro tenant, usuario desactivado,
   designación sin permisos, workers simultáneos y recuperación de un trabajo interrumpido.
7. Validar el JSON real contra `docs/cotiza-oportunidad-ganada.schema.json`.

La prueba con el destinatario real requiere revisar remitente, destinatario,
asunto y cuerpo completo antes de autorizar ese envío. No se hizo en esta ejecución.

## Estado y duplicados

El evento se guarda dentro de la transacción comercial que ya bloquea el negocio
por tenant y la propuesta. Captura, aviso y cola se materializan atómicamente.
Los fallos del proveedor ocurren después del commit y no revierten el cierre.

Solo se captura al entrar en `won`. Guardar de nuevo o corregir su fecha no crea
otro aviso. Retirar el resultado y volver a ganar representa un nuevo cierre.
Los roles se unen por usuario para aviso interno y por dirección normalizada
para correo, conservando ambos motivos. Las restricciones únicas impiden volver
a crear filas para el mismo evento/destinatario.

El snapshot conserva propuesta y revisión ganadoras, importe neto decimal y
moneda, fecha comercial e instante de registro. No se reemplaza por otra versión.
Si faltan datos mínimos, queda `opportunity_won_incomplete` sin fabricar un evento
exportable. Cambiar la fecha después conserva el evento original y registra la
corrección en la auditoría.

## Bandeja y acceso

El encabezado enlaza a «Avisos comerciales» con contador de no leídos. Se listan
los 50 avisos más recientes. El marcado de lectura conserva el primer timestamp.
La consulta y el PATCH revalidan tenant, identidad, usuario activo, tenant activo
y acceso actual a propuesta/oportunidad; ni un superadmin marca avisos de otro usuario.
El enlace abre la propuesta ganadora exacta y sigue exigiendo sus permisos normales.

`GET /api/notifications/won` devuelve únicamente el buzón del usuario actual.
`PATCH` recibe solo `notificationId`; tenant y usuario provienen de la sesión.
La descarga JSON conserva su auditoría y proyecta los destinatarios según el rol.
No lleva costos, márgenes, credenciales ni correos de destinatarios.

## Correo, recuperación y límites

El primer procesamiento se registra con `after()` tras confirmar el resultado.
La cabecera de un administrador procesa pendientes al abrir la app y cada minuto
mientras la pestaña está visible. Un cierre posterior también puede drenar la cola.
`POST /api/notifications/won-deliveries` permite procesar pendientes del tenant
actual a administración; `GET` muestra su estado e intentos. Hay límites de frecuencia.
No se añadió un cron, servicio ni suscripción. Si la aplicación queda inactiva,
los reintentos esperan una nueva actividad administrativa o procesamiento explícito.

La cola usa leases y `FOR UPDATE SKIP LOCKED`; el worker que perdió su lease no
sobrescribe el resultado de otro. Revalida la política, usuario, dirección y
permisos antes de transmitir. Desactivación, cambios de destinatario o pérdida
de acceso suprimen el envío. El cuerpo y remitente quedan congelados antes del
primer request; un cambio de remitente después exige revisión.

Resend recibe una clave estable por evento/buzón. Su ventana documentada es de
24 horas; el worker limita sus reintentos a 23 horas y cuatro intentos, con esperas
de 1, 5 y 15 minutos. Después queda «Requiere revisión», sin nuevo envío automático.
No cambiar la clave para resolver un resultado incierto sin conciliarlo antes.
Fuente: https://resend.com/changelog/idempotency-keys

`sent` significa «Aceptado por el proveedor», no entrega al buzón ni lectura.
Estas dos últimas señales requieren integración adicional de webhooks y no se
presentan como confirmadas. Se registran IDs de proveedor y códigos de error
acotados; no se guardan mensajes crudos del proveedor que puedan filtrar datos.

## Validación y reversión

La integración reproducible se ejecuta con `COTIZA_WON_DELIVERY_TEST_URL` apuntando
a una base vacía de localhost con el esquema Prisma, la migración de políticas y
`proposal_approvals.executed_by_user_id` de la base operativa. Ejecutar
`npx vitest run lib/db/won-delivery.integration.test.ts`. La suite rechaza hosts
remotos y aplica la migración de entregas dos veces.

Se ejecutaron pruebas DOM de la bandeja y límites de autenticación/aislamiento,
además de integración con PostgreSQL desechable, Next.js y el SDK Resend contra
un receptor local simulado. Se verificaron reintento 503, mismo sobre/clave,
aceptación única, lectura idempotente y exportación válida. No hubo envíos externos.
El recorrido visual completo con Clerk real sigue pendiente por el bloqueo de
Chromium local y la autenticación independiente de la vista previa.

Para revertir, apagar los dos flags de canal y el flag de captura antes de revertir
el código. Conservar eventos, avisos y entregas históricos. No borrar registros
para forzar reenvíos. Las tablas nuevas no alteran datos comerciales anteriores.
