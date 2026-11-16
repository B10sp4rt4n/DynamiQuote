# Piloto Cotiza: autorización con identidad y credencial registrada

Estado: diseño técnico listo para implementación; no hay endpoints, biometría, cambios de Clerk ni despliegue activados por este documento.

## Objetivo y alcance

Ensayar la autorización de una compra sintética de SynAppsSys desde PC y celular. PC muestra QR y enlace; celular abre directamente la confirmación. La decisión queda ligada a la identidad Clerk, empresa, credencial registrada y contenido exacto. El ensayo sólo genera evidencia de una decisión simulada: no crea compras, envía correos, factura ni modifica propuestas reales.

Capacidad premium propuesta, desactivada por defecto y habilitada por tenant mediante configuración del servidor. El primer tenant debe resolverse desde la BD, sin inventar IDs ni copiar usuarios de producción a pruebas. No contratar servicios adicionales. La compatibilidad y disponibilidad del plan Clerk deben verificarse antes de activar funciones nuevas.

## Base verificada

Repositorio B10sp4rt4n/DynamiQuote, rama feat/cotiza-nextjs-foundation, commit 8e655d6115f90b74712ceef3529aaffda06af1ed.

- cotiza-web/lib/auth/tenant-context.ts: auth().userId se busca por igualdad en app_users.user_id. La cuenta debe estar activa; rol y tenant se resuelven desde el registro local.
- cotiza-web/prisma/schema.prisma: app_users contiene user_id, role, active y tenant_id.
- cotiza-web/app/api/proposals/[proposalId]/approvals/route.ts: aprobación existente usa contexto del servidor.
- cotiza-web/lib/db/proposals.ts, registerProposalApprovalByTenant: registra aprobaciones por usuario y rol.
- cotiza-web/lib/db/proposal-approvals.ts: evidencia de aprobaciones existente.
- cotiza-web/lib/domain/proposal-approval-gate.ts: reglas existentes de owner y superadmin.

Estos archivos prueban una base de identidad y aprobaciones; no prueban que exista vinculación de dispositivo, passkeys activas, integración Recordia o protección del piloto en producción. No modificar los endpoints existentes durante el ensayo. Integrarlos después requiere evitar cualquier vía alternativa que eluda la nueva política.

## Identificadores y autoridad

| Identificador | Fuente y uso |
| --- | --- |
| issuer + clerk_user_id | Identidad de la instancia Clerk y su usuario autenticado; nunca tomar el aprobador del body o del QR. El ID ya existe: no crear un alias nuevo como identidad. |
| tenant_id | Empresa resuelta y autorizada por el servidor; la selección del navegador no concede permisos. |
| credential_id + public_key | Credencial WebAuthn registrada para aprobar, vinculada a issuer y clerk_user_id; el servidor verifica una firma, no sólo compara un ID. |
| device_record_id | ID interno del registro de esa credencial. Su etiqueta, por ejemplo “Teléfono de Salvador”, es informativa. No demuestra modelo o identidad física. |
| action_id + payload_hash | Operación y huella de su versión inmutable, calculadas en servidor. |
| challenge_id | Reto aleatorio, efímero y consumible una sola vez para esa operación y credencial. |
| reverification_id | Refuerzo opcional Clerk sujeto a compatibilidad verificada; no sustituye reto WebAuthn ni permisos. |

No usar correo, teléfono, dirección IP, nombre del aparato, cookie, user-agent o fingerprint del navegador como prueba principal de posesión. IP y navegador sólo pueden aportar contexto de auditoría. La sesión PC y la sesión móvil pueden tener session_id diferentes: se comprueba el usuario destinatario, no igualdad entre sesiones.

## Registro y recuperación de credenciales

1. Requerir sesión Clerk válida y cuenta local activa.
2. El alta inicial necesita habilitación administrativa explícita para ese usuario; las altas posteriores requieren una credencial ya confiable o recuperación administrativa revisada. Una sesión robada no debe bastar para registrar otro aprobador.
3. Emitir reto de registro de un solo uso y validar la respuesta WebAuthn en servidor: challenge, origin HTTPS permitido, RP ID, tipo, user verification y credencial.
4. Guardar clave pública, credential_id, propietario, estado, fecha UTC y flags de backup. No guardar huellas, rostros, claves privadas ni JWT.
5. Revocar credenciales perdidas y anular sus solicitudes pendientes. La recuperación no aprueba operaciones pendientes ni permite autorregistrarse de nuevo sin revisión.

La credencial de aprobación puede requerir un registro WebAuthn específico del dominio de Cotiza. No asumir que una passkey del dominio de Clerk puede reutilizarse con otro RP ID.

## Qué significa “casado al dispositivo”

WebAuthn permite comprobar posesión de una credencial registrada con verificación local. Una passkey sincronizable puede existir en varios aparatos; por tanto, “credencial reconocida” no equivale a “este celular físico”.

El piloto debe clasificar:
- BE=1: credencial elegible para respaldo; identificarla como sincronizable, incluso si BS=0.
- BE=0 y BS=0: credencial declarada de un solo autenticador. Para el perfil estricto, rechazar BE=1 y combinaciones inválidas.
- Si los celulares de prueba no ofrecen una credencial adecuada, dejar ese perfil bloqueado y documentar el límite. Evaluar una llave de seguridad compatible o integración nativa después; no degradar silenciosamente la garantía.

BE=0 por sí solo no certifica un modelo de teléfono, hardware seguro ni resistencia absoluta a clonación. Afirmaciones de hardware requieren política de attestation y verificación de confianza adicionales. Un autenticador externo tampoco demuestra que sea el teléfono quien guarda la clave.

Registrar “usuario verificado mediante credencial” cuando eso sea lo demostrado. No afirmar “Face ID” o “huella” a partir del flag UV: el mecanismo local puede ser PIN.

## Recorrido del piloto

1. Iniciador autenticado elige la compra sintética y un aprobador habilitado del tenant. El servidor valida ambos.
2. Se fija un snapshot: empresa, acción, folio, proveedor/destinatario, partidas, importes decimales normalizados, moneda y versión. Se calcula un hash canónico, sin floats ambiguos.
3. Se crea solicitud pendiente de 5 minutos, con aprobador exacto y política de credencial. El enlace usa un token aleatorio opaco; guardar sólo su hash.
4. PC muestra QR y “Copiar enlace”. Celular navega directamente a confirmación. La detección del dispositivo sólo cambia la presentación, nunca permisos. Ofrecer selección manual si se detecta mal.
5. Abrir el enlace no autoriza ni revela detalles comerciales antes de autenticar y comprobar el destinatario. Si no hay sesión móvil, iniciar sesión y volver al mismo origen con un retorno validado.
6. Mostrar el snapshot exacto y botones “Autorizar ensayo” / “Rechazar”. No confirmar por abrir el QR, iniciar sesión, copiar texto o actualizar la página.
7. Al confirmar, generar reto WebAuthn aleatorio enlazado en BD a action_id, payload_hash, tenant y aprobador. Solicitar userVerification required.
8. Verificar firma, challenge, origin, RP ID, UV, propietario y estado vigente de la credencial. Releer cuenta activa, rol, tenant, política y versión del objeto.
9. Consumir reto y cerrar la decisión de forma atómica junto con su evidencia. Dos solicitudes concurrentes sólo pueden producir una transición. Un reintento devuelve el mismo resultado sin otra ejecución.
10. PC consulta estado autenticado periódicamente y muestra “Ensayo autorizado”. No compartir la sesión móvil ni tokens de Clerk con la PC.

Rechazo, cancelación, vencimiento, revocación o cambio del snapshot invalidan el reto. Un cambio comercial exige una solicitud nueva. Los GET no modifican decisiones. Proteger los POST frente a CSRF y aplicar rate limits. No incluir tokens en logs, analítica o referencias de terceros; usar Referrer-Policy no-referrer y Cache-Control no-store.

## Persistencia y evidencia propuestas

Tablas nuevas separadas para credenciales, solicitudes, retos y eventos del ensayo; índices por tenant y propietario, y unicidad de credential_id dentro del RP. Diseñarlas en Prisma antes de aplicar cambios. Retos y tokens con entropía criptográfica y vencimiento del servidor.

Estados: pending → approved | rejected | expired | cancelled | invalidated. “Aprobado” aquí significa sólo ensayo aprobado. La ejecución real futura necesita permiso independiente y consumo atómico de una autorización ligada al mismo payload.

Evento mínimo: event_id, action_id, tenant_id, actor_user_id, issuer, credential_id, payload_hash, decisión, política, UV, BE/BS, issued_at, verified_at, expires_at y resultado. UTC como referencia; visualización configurable por zona IANA, inicialmente America/Mexico_City. No reescribir evidencia histórica al revocar.

Preparar un esquema exportable para Recordia; no declarar conexión ni custodia activas hasta comprobarlas.

## Clerk: reverificación por acción

Clerk documenta sub como ID de usuario y fva como antigüedad de verificación. También documenta el shortcode {{session.reverification_id}} para añadir un claim que identifica una reverificación.

Si se activa este refuerzo: validar soporte de versión/plan y configuración real; exigir evento nuevo posterior a la creación de la solicitud, verificar JWT en servidor y fva, y consumir una combinación issuer + user_id + reverification_id una sola vez. La ventana de reverificación por sí sola no prueba consentimiento nuevo para cada operación. Clerk documenta posibles degradaciones del nivel solicitado: el perfil estricto debe bloquear una garantía insuficiente.

Este refuerzo no sustituye la firma WebAuthn específica del reto del piloto. La comprobación de identidad en Clerk y la prueba de posesión de la credencial son controles distintos.

## Criterios de aceptación pendientes

| Caso | Resultado requerido |
| --- | --- |
| PC → QR → móvil, usuario y credencial permitidos | Una decisión simulada y actualización de PC |
| Inicio en móvil | Confirmación directa, sin QR obligatorio |
| QR abierto con otra cuenta o tenant | Denegación, sin detalles comerciales |
| Cuenta desactivada o rol retirado entre apertura y confirmación | Denegación |
| Dispositivo/credencial no registrado o revocado | Denegación; sin alta automática |
| ID de dispositivo o userId falsificado en body | Ignorado o rechazado |
| Firma inválida, origin/RP incorrecto o UV ausente | Denegación |
| Passkey BE=1 bajo perfil de un solo autenticador | Bloqueo explícito |
| Importe, moneda, proveedor, partidas o versión modificados | Invalidación y solicitud nueva |
| Reto repetido, autorización vencida o confirmaciones paralelas | Ninguna segunda decisión o ejecución |
| QR reenviado, visita GET o previsualizador del enlace | Ninguna aprobación |
| Pérdida de dispositivo y recuperación | Revocación y revisión; ninguna compra liberada |
| Política apagada o tenant fuera del piloto | Endpoints del ensayo denegados |

## Orden de implementación

1. Resolver tenant y usuarios de ensayo reales; validar opciones de credencial en iPhone/Android/PC, RP estable, versiones y plan Clerk. Capturar resultados sin secretos.
2. Implementar registro/revocación de credenciales, esquema y verificador WebAuthn con librería mantenida; probar políticas BE/BS.
3. Implementar solicitudes, snapshot, reto ligado a operación y consumo atómico; pruebas de aislamiento, concurrencia y replay.
4. Añadir vistas PC/móvil, QR, enlace y actualización del estado; ejecutar aceptación con compra sintética.
5. Entregar evidencia del ensayo y sólo después integrar el flujo de compra real, sus reglas owner/superadmin y todas las rutas alternativas.

No hay pruebas ejecutadas de esta capacidad en esta entrega documental.

## Fuentes primarias

- https://clerk.com/docs/guides/sessions/session-tokens
- https://clerk.com/docs/guides/secure/reverification
- https://www.w3.org/TR/webauthn-3/ (verificación de usuario, validación de ceremonias y flags BE/BS)
