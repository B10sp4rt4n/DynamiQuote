# Piloto de aviso de oportunidad ganada

Implementación en modo dry run. No contiene transporte de correo ni publica
avisos en una bandeja interna. La vista muestra lo que recibirían los usuarios.
No se habilita automáticamente en SynAppsSys ni en otros tenants.

## Recorrido

1. Aplicar `prisma/manual/20261107_won_notifications.sql` en el entorno aislado.
2. Habilitar `COTIZA_WON_EVENT_PILOT=true` en ese entorno; por defecto está apagado.
3. Abrir la ficha de una oportunidad como owner/admin del tenant o superadmin.
4. En «Aviso de cierre ganado · Piloto», activar captura, mantener «Avisar al
   responsable» y seleccionar al usuario de Salvador como designado administrativo
   del tenant SynAppsSys, verificando su identidad y correo en el directorio.
5. Guardar. Esta política afecta a los próximos cierres de esa empresa.
6. Con una oportunidad de prueba completa, autorizar una propuesta y registrar
   su resultado ganado. La política no autoriza propuestas ni altera permisos.
7. Revisar el último cierre y descargar JSON. Si Salvador es también responsable,
   aparecen ambas razones en un único destinatario por canal.

No cambiar resultados comerciales reales para probar. No reconstruir cierres
anteriores al piloto: el sistema no inventa fechas, destinatarios ni eventos.

## Identidad y duplicados

- La selección comercial se deriva del resultado de la propuesta, no del envío.
- El evento se guarda junto con la transición comercial dentro de la transacción
  que ya utiliza los bloqueos de negocio/tenant y propuesta.
- Solo dispara al entrar en `won`: reintentos y correcciones de fecha no crean
  otro evento. Tras retirar el resultado y volver a ganar, existe un nuevo cierre.
- Cada evento tiene UUID y clave de tenant/oportunidad/secuencia/tipo.
- El responsable y los designados se consolidan por `user_id`, uniendo motivos.
- La vista de correo además agrupa por dirección normalizada (trim + minúsculas).
  Los avisos internos mantienen identidades por usuario, no por correo compartido.
- Se conservan propuesta ganadora, revisión de cotización, importe decimal neto,
  moneda, fecha comercial y fecha real de registro. La zona actual de Cotiza es CDMX.
- Si falta información mínima, se registra `opportunity_won_incomplete` en la
  auditoría. Se conserva el cierre, sin fabricar un evento exportable completo.

## Datos y acceso

La política vive en `opportunity_won_notification_policies`, aislada por tenant,
con versión, fecha y último actor. Solo administración configura destinatarios;
el servidor valida que sean usuarios activos de esa empresa.

El evento inmutable vive en `proposal_audit_events` y corresponde al identificador
de oportunidad de la propuesta que ganó. La ficha canónica de un negocio con
alternativas puede recuperar eventos de sus miembros autorizados. Su secuencia
es por identificador de oportunidad, no por conjunto de alternativas.

`GET /api/opportunities/:id/won-event` devuelve un sobre de prueba con el evento,
asunto, cuerpo y destinatarios actuales elegibles. `?download=1` descarga el
snapshot y registra la exportación. La administración ve todos los destinatarios;
un usuario ordinario solo ve su propia entrada. Esta proyección no añade campos
al contrato. La descarga posterior no cambia el snapshot comercial.

Los usuarios desactivados se excluyen de la vista de entrega actual aunque
permanezcan en el snapshot histórico. No se incluyen correos, márgenes, costos,
credenciales ni documentos adjuntos en el JSON del evento. El asunto/cuerpo usa
texto plano. El enlace al negocio sigue requiriendo autenticación y permisos.

El JSON Schema adjunto es el contrato propuesto de integración. La configuración
por canal descrita en ese diseño es una ampliación futura: este primer piloto
prepara ambos canales. Ningún consumidor debe tratar el evento como prueba de envío.

## Validación y límites para activación

Se probaron consolidación de roles y buzones, exclusión de usuarios no elegibles,
fechas históricas, importes decimales, captura de transición y no repetición,
permisos de exportación y privacidad de destinatarios.

Pendiente antes de activar: aplicar y verificar la migración en PostgreSQL aislado,
recorrer la interfaz completa con una sesión autenticada y comprobar la ficha de
Salvador en SynAppsSys. Estas verificaciones no se sustituyen por pruebas con mocks.

Para envío real faltan transporte asíncrono con reintentos e idempotencia por
buzón/evento, registro de entrega por canal, bandeja interna con leído/no leído,
y revalidación de permisos específicos del destinatario. La versión actual no
habilita ninguno de esos envíos y no contiene una llamada a Resend/Gmail.

Reversión: apagar el flag y revertir código. Conservar los eventos históricos.
La migración no modifica datos comerciales existentes ni activa ninguna política.
