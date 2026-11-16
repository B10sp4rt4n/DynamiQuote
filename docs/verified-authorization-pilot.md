# Cotiza + AUP + Recordia: piloto SynAppsSys

## Alcance implementado

Capacidad premium `verified_authorization_pilot`, apagada por defecto. El primer modelo es exclusivamente el tenant existente SynAppsSys (`slug=sys`). La consulta de preparación confirmó una cuenta activa de Salvador con rol superadmin y vínculo por ID Clerk. No se copiaron usuarios, sesiones ni compras de producción a las pruebas.

| Capa | Responsabilidad |
| --- | --- |
| Clerk | Sesión válida de la instancia esperada y userId exacto. Reverification fresca para la habilitación inicial. |
| AUP / política determinista | Identidad local activa, tenant, facultades, política de credencial, contenido exacto y transiciones permitidas. No necesita un modelo IA. |
| Cotiza | Recorridos PC/móvil, firma y comprobación WebAuthn, consumo único y gestión de credenciales del piloto. |
| Recordia v1 | Secuencia de eventos, clase epistémica, procedencia, hashes, prueba de firma y exportación verificable sin conexión. |
| HotVault | No conectado. Los paquetes se identifican como `prepared_for_custody`; no se presentan como sellados o certificados. |

Las compras son sintéticas y sólo generan `purchase.simulated`. Los registros y revocaciones de credenciales sí producen cambios reales dentro del piloto. No altera las rutas existentes de ganada, órdenes de compra, facturación ni correo. Integrar compras reales requerirá proteger todas sus vías de ejecución; este piloto no afirma que ya lo haga.

## Modelo de identidad y empresa

El módulo nuevo no utiliza `getCurrentTenantContext`: evita sus conciliaciones antiguas por nombre, correo, metadata y cookies de desarrollo. Exige sesión Clerk con issuer exacto, userId y sessionId; deniega sesiones pendientes. Consulta app_users por igualdad de user_id, exige cuenta activa y tenant_id exacto, incluso para superadmin. La empresa se fija mediante configuración del servidor y debe ser el registro activo de SynAppsSys con slug `sys`.

La habilitación requiere tanto la configuración del servidor como la capacidad premium de ese tenant en BD. Habilitarla para otro tenant no concede acceso al módulo. Un selector de empresa del navegador nunca modifica este contexto. Los roles se releen en cada transacción y se bloquean durante la decisión para evitar cambios intermedios.

Los aprobadores y administradores del piloto también requieren nominación permanente por ID Clerk en COTIZA_APPROVAL_APPROVER_USER_IDS y COTIZA_APPROVAL_MANAGER_USER_IDS. Inicialmente se nomina sólo la cuenta verificada de Salvador. Un rol obtenido por mecanismos legacy de otras pantallas no concede por sí solo facultades en este piloto. Los managers deben pertenecer también a la lista de aprobadores. La nominación no sustituye rol vigente ni firma de una credencial registrada.

## Operaciones

1. **Compra de ensayo:** captura folio, proveedor, concepto, importe decimal exacto y moneda. El aprobador debe ser owner, admin o superadmin activo de SynAppsSys. La autoaprobación se admite sólo en este ensayo; no define una política para compras reales.
2. **Nueva credencial:** owner o superadmin solicita habilitar a un usuario exacto; un owner o superadmin con una credencial existente debe aprobar. Aplicar la decisión crea una habilitación personal de registro de diez minutos.
3. **Revocación:** owner o superadmin solicita revocar una credencial concreta; requiere aprobación firmada. Al aplicarse, se invalidan solicitudes pendientes/aprobadas del usuario y sus habilitaciones pendientes. Una habilitación originada en una firma revocada tampoco puede utilizarse para registrar.

La primera credencial requiere una nominación administrativa temporal, ticket aleatorio de un solo uso, cuenta local owner/superadmin y nueva reverificación Clerk. Un intento de alta de dos minutos captura el ID de reverificación previo. El backend exige que haya cambiado después de ese intento y comprueba `fva[0] <= 1`; una verificación anterior reciente no basta. El intento y ticket se consumen una vez. La interfaz provoca expresamente la reverificación antes de solicitar esa habilitación. La instancia debe exponer el custom claim `reverification_id: {{session.reverification_id}}`.

## PC y celular

- PC: genera QR localmente y permite copiar el enlace. La pantalla consulta el estado cada cinco segundos mientras hay solicitudes pendientes.
- Celular: ofrece continuar directamente en el dispositivo, sin QR obligatorio. El usuario puede mostrar el QR si quiere cambiar de aparato.
- El enlace contiene un secreto aleatorio en el fragmento URL; el servidor conserva su hash. La página lo retira de la barra y lo conserva temporalmente en la pestaña durante el inicio de sesión. No se incluye en el retorno de Clerk ni en parámetros HTTP.
- La cuenta destinataria debe autenticarse antes de obtener el contenido. Abrir, previsualizar o compartir el QR no aprueba nada.
- Los botones Autorizar/Rechazar solicitan una firma. El solicitante aplica posteriormente la autorización una sola vez. Se muestran vencimiento CDMX y fechas UTC en la bitácora.

Rutas: `/autorizacion-verificable`, `/confirmar-autorizacion/[requestId]`, y API `/api/verified-authorization/*`. El módulo tiene un layout separado para no activar la conciliación de identidad del dashboard antiguo.

## Vínculo criptográfico

El snapshot incluye empresa, política y modalidad de credencial, operación y aprobador exacto. Un reto deriva de SHA-256 sobre una declaración canónica con nonce aleatorio, action_id, payload_hash, decisión, aprobador, tenant e issuer. La respuesta WebAuthn firma ese reto; el expediente conserva la declaración para comprobar el vínculo sin consultar al servidor.

La biblioteca SimpleWebAuthn comprueba firma, challenge, origen HTTPS, RP ID, presencia/verificación y contador. La aplicación comprueba propietario, revocación, elegibilidad de respaldo y el contenido nuevamente. Cualquier cambio de contenido o de política invalida el uso de la solicitud. La decisión y el consumo se serializan con bloqueo transaccional PostgreSQL y quedan registrados en la misma transacción que su efecto.

En el perfil estricto sólo se aceptan credenciales `singleDevice` (BE=0). Una passkey sincronizable se rechaza incluso cuando aún no esté respaldada. Esto puede impedir registrar una passkey de plataforma de ciertos celulares. No se degrada automáticamente la política. Puede utilizarse una llave compatible, o decidir explícitamente el perfil `registered` configurando `COTIZA_APPROVAL_SINGLE_DEVICE=false`; eso exige solicitudes nuevas y no equivale a identificar un celular físico.

**Límites:** userVerification no identifica si se utilizó rostro, huella o PIN. `singleDevice` no certifica modelo, hardware ni attestation confiable. WebAuthn ordinario tampoco acredita por sí mismo qué contenido mostró la pantalla. El piloto incluye esas limitaciones en el paquete; no ofrece certificación jurídica ni resistencia absoluta a equipos comprometidos.

## Persistencia, seguridad y Recordia

Seis tablas aditivas en Prisma: credenciales, solicitudes, habilitaciones de registro, retos, eventos y contadores de intentos. No se guardan biometría, claves privadas ni JWT de sesión. Los POST exigen origen exacto, JSON, contexto de tenant y límite de tamaño. Las lecturas y exportaciones comprueban pertenencia; los intentos se limitan en PostgreSQL para compartir el control entre instancias. Las respuestas y páginas sensibles usan no-store y no-referrer.

Los eventos son append-only en la aplicación y el SQL agrega un trigger que rechaza UPDATE/DELETE. Cada expediente tiene secuencia, hash previo y hash del registro. El exportador comprueba la cadena antes de entregarla e incluye fuentes, evidencia, snapshot y prueba WebAuthn. Un administrador de BD aún puede desactivar controles o reconstruir toda una historia: conservar un manifiesto externo ayuda a detectar esa sustitución; no equivale a custodia WORM.

Verificación local independiente, desde cotiza-web:

```sh
node scripts/verify-approval-evidence.mjs /ruta/Recordia_Cotiza_solicitud.json
```

Comprueba snapshot, secuencia, hashes, declaración del reto, firma, usuario declarado, tenant, política y que no haya ejecución sin aprobación. La asociación inicial entre clave y persona y la fecha del servidor siguen requiriendo confianza en el sistema de origen; no se inventa un sello externo.

## Preparación del entorno

1. Revisar este PR y aplicar **una vez**, en una rama/entorno de ensayo, `prisma/manual/20261116_verified_authorization.sql` con conexión directa y parada ante error. La migración crea sólo las seis tablas, índices, FK y guardas del piloto. No altera datos comerciales. Prisma schema sigue siendo la fuente del esquema; las guardas SQL son adicionales.
2. Completar las variables de `.env.verified-authorization.example` en configuración privada. No versionar tickets ni IDs personales. El origen debe ser HTTPS estable: cambiar el dominio del RP requiere registrar nuevas credenciales.
3. Desde cotiza-web ejecutar `node scripts/configure-approval-pilot.mjs` con DATABASE_URL y COTIZA_APPROVAL_SETUP_ACTOR. Por defecto sólo verifica y devuelve el plan. `--apply` habilita únicamente la capacidad de SynAppsSys y agrega su evento administrativo; no registra dispositivos ni cambia roles.
4. Configurar el claim Clerk de reverificación, nominar la cuenta ya verificada y una ventana UTC corta con ticket nuevo. Desplegar con feature flag habilitado únicamente en el entorno preparado.
5. Entrar en `/autorizacion-verificable`, solicitar habilitación inicial y registrar la credencial. Retirar la nominación/ticket temporales al finalizar. Preparar una segunda credencial/administrador de respaldo mediante aprobación firmada.
6. Crear compra ENSAYO-SYN-001 por 1,250.00 MXN a Proveedor sintético. Probar PC→QR→celular y celular directo, autorizar, aplicar una vez y exportar/verificar el expediente.

La preparación de esta entrega sólo consultó producción para resolver empresa, cuenta y estado. No aplicó el esquema, no activó la capacidad ni modificó Clerk o sus usuarios.

## Pérdida del último autenticador

La recuperación requiere un operador autorizado con acceso administrativo a BD. Debe revocar las credenciales perdidas e invalidar solicitudes/habilitaciones mediante el procedimiento `scripts/recover-approval-devices.mjs`; por defecto es dry-run y exige usuario destinatario y motivo. `--apply` registra la intervención como decisión administrativa con identidad declarada, no como firma biométrica del usuario. Después se emite un ticket temporal nuevo y se realiza reverificación Clerk para el registro. La recuperación nunca ejecuta una compra pendiente.

## Verificación de desarrollo

Las pruebas específicas usan PostgreSQL temporal y autenticadores ES256 sintéticos: no emulan una comprobación física de Face ID. La suite crea y elimina su cluster, no acepta una base remota y prueba alta, firma, aislamiento, origen, UV, replay, concurrencia, contenido, vencimiento, cancelación, rechazo, roles, revocación, recuperación, límites y exportación. Las pruebas DOM verifican que el móvil omite QR, que no hay detalles antes de autenticar y que la confirmación requiere interacción explícita. La prueba física de iPhone/Android y el recorrido Clerk real quedan para el entorno preparado.

```sh
npm ci --include=dev
npm --prefix cotiza-web run db:generate
# Directorio de binarios PostgreSQL instalados localmente para la prueba temporal:
COTIZA_APPROVAL_TEST_PG_BIN=/ruta/pgsql/bin npm --prefix cotiza-web test
```

Fuentes de implementación: https://simplewebauthn.dev/docs/packages/server · https://simplewebauthn.dev/docs/packages/browser · https://clerk.com/docs/guides/secure/reverification · https://www.w3.org/TR/webauthn-3/
