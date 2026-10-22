# Multitenant: requisito previo a integrar CRM

## Contrato

Cotiza es la autoridad de identidad y pertenencia. Clerk autentica al usuario;
una fila activa en `app_users` cuyo `user_id` coincide exactamente con Clerk
concede rol y tenant. Sin fila, usuario inactivo, tenant ausente o inactivo:
acceso denegado. No se reconcilian cuentas en un GET por nombres, alias o correo.
El webhook firmado y el flujo administrativo existente vinculan IDs explícitos.
La corrección no modifica usuarios ni permisos existentes automáticamente.

Superadmin puede seleccionar otro tenant activo. Owner/admin operan solo en su
tenant; vendedores mantienen las reglas comerciales existentes. Cada cambio
por el endpoint y cada restablecimiento se registra con actor, origen, destino
y fecha antes de emitir/eliminar la cookie. El fallo de auditoría bloquea el cambio.
La cookie expresa selección, nunca rol: cada petición vuelve a resolver la
identidad y membresía exactas. Su edición por un usuario común no cambia tenant.
La auditoría registra solicitudes aceptadas; no prueba que el navegador haya
recibido la cookie y no es un ledger WORM.

Sin credenciales Clerk, producción y pruebas deniegan acceso. Solo desarrollo
puede habilitar `ALLOW_BOOTSTRAP_AUTH=true` para una demo local. Las cookies del
harness solo funcionan en desarrollo con `ALLOW_DEV_COOKIE_AUTH=true` y una fila
local exacta activa; no habilitar estas opciones en un despliegue compartido.

Clientes, contactos, oportunidades, tareas e interacciones se consultan por
tenant. Tareas e interacciones solo pueden apuntar a una oportunidad del mismo
cliente y tenant. Los servicios validan referencias incluso para llamadas
internas; la migración refuerza los vínculos en PostgreSQL para cubrir concurrencia
y escritores ajenos a HTTP. Quotes/proposals no pueden enlazar oportunidades
ni clientes de otro tenant. Un contacto o cliente no se copia al cambiar tenant.

## Implementación y pruebas de este cambio

- Resolución de sesión exacta; sin ascenso de permisos por coincidencias de identidad.
- Sin fallback anónimo a owner en producción ni fallback al primer tenant.
- Cambio de contexto reservado a superadmin y auditado.
- Validación de padres en servicios de contactos, tareas, interacciones y alta de oportunidades.
- Consultas de autores de interacciones limitadas al tenant.
- Migración aditiva con claves compuestas y validación de relaciones históricas.
- Pruebas unitarias de identidad, roles, cookies, padres entre dos tenants y fallo de auditoría.

## Despliegue: condiciones obligatorias

1. Identificar el despliegue activo y su proyecto/rama/base de Neon sin exponer secretos.
2. Confirmar que cada usuario legítimo (incluido superadmin) está vinculado por
   `app_users.user_id` a su ID Clerk real. Resolver cuentas pendientes mediante
   el flujo administrativo/webhook, nunca mediante coincidencias de nombres.
   Este cambio puede denegar cuentas que dependían del antiguo fallback.
3. En una rama aislada ejecutar `20261022_multitenant_foundation.sql`. Si alguna
   validación falla, toda la transacción se revierte. Revisar los registros;
   no asignar tenants por conveniencia ni borrar datos para hacerla pasar.
4. Probar alta de cotización, versión, propuesta, cierre, reapertura, contactos,
   tareas e interacciones con dos tenants, owner/admin/vendedor y superadmin.
   No enviar correos ni timbrar facturas reales para esta validación.
5. Aplicar migración a la base destino antes de desplegar el código: la tabla
   de cambios de contexto no se crea al vuelo. Desplegar de forma controlada.
6. Conservar las claves y auditoría ante rollback de código. Un rollback al
   resolver anterior reintroduce los huecos de acceso; preferir corregir la
   vinculación de usuarios y mantener el resolver estricto.

## Pendiente para declarar completado el aislamiento de toda la plataforma

Este PR establece la base y corrige bloqueos; no certifica todo el sistema.
Faltan la conciliación de datos reales, prueba con Clerk real, revisión completa
de descargas/PDF/XLSX, reportes/KPIs, procesos de fondo y rutas legacy Python.
Confirmar las reglas de visibilidad por vendedor en la vista 360: varias lecturas
actuales usan alcance de tenant, distinto de alcance por propietario.
No integrar ni migrar el CRM anterior hasta cerrar esa evidencia.

RLS no se activa en este cambio. Evaluarlo con rol de aplicación sin BYPASSRLS,
contexto transaccional compatible con el pool y tratamiento explícito de
superadmin y procesos internos. No usar SET de sesión persistente con pool de
transacciones. Las claves compuestas protegen relaciones; no sustituyen RLS ni
los filtros/autorización de lectura.

## Evidencia de validación (22 octubre 2026)

- `vitest`: 428 pruebas pasan; 18 casos de integración opt-in omitidos. Se
  excluyó `validate-quote-lifecycle.e2e.test.ts`, que requiere DATABASE_URL y
  acceso a una base real. La suite completa sin excluirlo falla por falta de
  esa variable, no por una aserción de aislamiento.
- 39 pruebas nuevas de identidad, contexto y relaciones pasan.
- TypeScript sin errores y ESLint en archivos modificados sin errores.
- PGlite/PostgreSQL aislado: migración ejecutada dos veces, operaciones válidas
  y auditoría aceptadas, nueve escrituras cruzadas rechazadas; datos históricos
  inconsistentes abortan toda la migración sin borrar el registro original.
- Proyecto Neon DynamiQuote, rama aislada `crm-multitenant-validation-20261022`
  (`br-old-pond-ahe5jto3`): las diez claves foráneas pasan VALIDATE con una copia
  de los datos actuales. Expiración configurada para 23 octubre 2026, 20:25 UTC.
  No se aplicó DDL ni se modificaron registros en producción.
- Conteos de origen: 4 tenants, 62 clientes, 163 oportunidades.
- Usuarios activos: cinco con ID de formato Clerk (incluye un superadmin),
  tres pendientes de invitación y un superadmin con identificador legacy.
  El formato no acredita por sí solo existencia en Clerk; revisar el vínculo
  exacto de ese superadmin antes de activar el resolver estricto.

Para repetir la validación SQL sin Neon ni datos reales, instalar PGlite en
un directorio temporal y ejecutar `scripts/check_multitenant_migration.mjs`
con `PGLITE_MODULE` apuntando al `dist/index.js` de esa instalación, o instalar
`@electric-sql/pglite` temporalmente sin guardar dependencias y ejecutar el script.
No necesita DATABASE_URL ni claves de producción.

## Segunda revisión: descargas, facturación y rutas legacy

- PDF y XLSX, incluidos HEAD y carga de partidas, aplican el mismo gate de
  propietario que el detalle de propuesta. Owner/admin/superadmin conservan
  alcance dentro del tenant seleccionado; un vendedor ajeno obtiene 404.
- Estado de factura, generación de prefactura, preview, PDF y timbrado aplican
  ese gate antes de leer información fiscal o llamar al proveedor. Las pruebas
  mockean el proveedor: no se enviaron correos ni se timbraron facturas reales.
- Los lectores de propuestas filtran por tenant tanto el padre como sus
  documentos y partidas. Los datos fiscales no siguen un cliente de otro tenant.
- `20261022_multitenant_documents.sql` se aplica DESPUÉS de la migración de
  foundation y ANTES del código nuevo. Refuerza partidas, documentos formales y
  auditoría con tres claves compuestas adicionales. Validada en la misma rama
  Neon y contrastada con escrituras cruzadas rechazadas sin registros residuales.
- El script aislado prueba ambas migraciones dos veces y doce relaciones
  cruzadas rechazadas. Las consultas sobre la copia de datos no encontraron
  relaciones inconsistentes en partidas, documentos ni auditoría.
- Resultado actualizado: 455 pruebas pasan, incluidas 66 nuevas respecto de la
  base inicial; 18 casos opt-in omitidos y el E2E dependiente de DATABASE_URL
  excluido. TypeScript sin errores. ESLint de los archivos modificados sin
  errores; conserva una advertencia preexistente en proposals.ts por variable
  no utilizada.

### Identidad y despliegue: comprobado y pendiente

La conexión Railway se restableció tras reinstalar su integración en ChatGPT.
Se confirmó servicio `cotiza-web` online, sin cambios pendientes ni cron dentro
  del proyecto del mismo nombre. Railway muestra nombres de variables, no sus
valores, con estas credenciales OAuth. Tener configuradas las variables Clerk
no acredita que un usuario exista o que un login haya pasado.

Neon confirma que `salvador.ruiz` tiene un `user_id` de formato Clerk y rol
superadmin. El superadmin legacy tiene alias `admin`, ID distinto y pertenece
a otro tenant. No son identidades intercambiables: no se fusionaron, reasignaron
ni desactivaron. Falta contrastar los IDs exactos con Clerk y probar login real.

La revisión estática de `app.py`/`database.py` encontró lectores legacy por ID
sin tenant obligatorio (`get_quote_by_id`, `get_quote_by_group_id`,
`load_versions_for_group`, `load_lines_for_quote`, `get_logos`). El FastAPI en
`src/api/main.py` expone cálculos sin persistencia de clientes; no es una API de
acceso a los registros del CRM. No se comprobó el despliegue activo de las rutas
legacy ni se modificaron sus permisos. No exponer ni reutilizar esos lectores
como puente de integración hasta convertirlos a tenant obligatorio y probarlos.

Los controles Next.js y PostgreSQL preparados aquí no certifican que toda la
plataforma legacy sea multitenant. El PR sigue en borrador, sin despliegue de
producción ni migración del CRM anterior. Para liberar: login real, confirmar
el despliegue que usa Cotiza y resolver o aislar el acceso legacy documentado.

## Contención del acceso antiguo y bloqueo de liberación

`app.py` verifica la base antes de inicializarla, autenticar usuarios o ejecutar
migraciones. Si tiene más de un tenant (también cuenta inactivos), cero tenants
en PostgreSQL, una identidad de tenant inválida o no puede comprobar el estado,
se detiene. Solo se conserva el arranque de SQLite local nuevo y bases con un
solo tenant. No hay una variable de entorno para saltar esta comprobación.
Con los cuatro tenants actuales, el entrypoint antiguo queda bloqueado al
recibir este cambio. No se han detenido servicios ni cambiado despliegues.

Nueve pruebas Python pasan para bases nuevas, de un tenant, compartidas,
tenants inactivos, estado desconocido y orden del guard antes del setup. Esta
contención del entrypoint no hace seguras las funciones `database.py` para
consumo directo: siguen fuera del contrato de integración y no deben exponerse
como API ni reutilizarse sin tenant obligatorio.

## Preview aislada de Cotiza

El proyecto Vercel `dynami-quote` (`prj_DJT883Ac7UNuSKMrZUD1rPjZdsOd`) está
vinculado al repositorio B10sp4rt4n/DynamiQuote. El 403 anterior se produce al
pasar el equipo explícitamente. Consultar por ID de proyecto con la conexión
existente, sin `teamId`, sí funciona; no se necesitó reinstalar Vercel ni
ampliar permisos. Este acceso no equivale a haber probado un login Clerk.

Se configuró un override `DATABASE_URL` exclusivamente para target preview y
rama Git `fix/multitenant-foundation`, apuntando a la rama Neon aislada
`br-old-pond-ahe5jto3`. Producción, desarrollo y previews de otras ramas
conservan sus valores anteriores. La rama Neon expira el 23 octubre 2026 a las
20:25 UTC (14:25 Ciudad de México); el preview dejará de tener base al expirar
hasta que se cree/seleccione otra rama de pruebas. No se cambian credenciales
ni DNS de producción. Las dos migraciones ya están aplicadas en esta copia.

La autenticación conserva la configuración Clerk existente. No probar altas,
invitaciones ni cambios de roles reales desde el preview. La validación manual
inicial es iniciar sesión, comprobar el tenant visible y recorrer clientes,
oportunidades y propuestas propias. Para validar otro tenant, superadmin usa
el selector autenticado (la auditoría se guarda únicamente en la copia).
Después probar con un vendedor y comprobar rechazo al usar IDs ajenos,
PDF/XLSX y vistas de factura, sin timbrar ni enviar correo. Los secretos de
correo/facturación están limitados a producción en la configuración consultada.

Este preview no habilita automáticamente capacidades CRM en producción y el
PR permanece en borrador hasta recopilar evidencia de login y aislamiento.

## Revisión posterior al acceso reportado por Salvador

Salvador respondió «Ya» al paso de entrar con su cuenta habitual al preview.
Se registra como confirmación del usuario de haber completado ese paso, no como
una prueba automatizada de sesión, del tenant mostrado ni del acceso de otros roles.
Vercel reportó READY para el despliegue del commit `2baff3c`; su protección
bloqueó la comprobación HTTP automática con la conexión disponible.

Una consulta de solo lectura sobre la rama aislada confirmó cuatro tenants,
62 clientes y cero oportunidades, tareas o interacciones con cliente de otro
tenant. No había eventos de cambio de contexto en esa copia; no se acredita
por ello el uso real del selector ni una prueba con un vendedor distinto.

Se corrigieron los JOIN de KPIs: las cinco consultas de importes vinculan
partidas por propuesta Y tenant; el ranking resuelve nombres de usuarios solo
dentro del tenant de la propuesta. Una referencia histórica a un autor de otra
empresa conserva su ID, pero no obtiene su nombre ni alias. Las claves
compuestas siguen siendo necesarias para impedir nuevas partidas cruzadas.

Seis pruebas ejecutan el SQL parametrizado real de estas consultas en PGlite
con dos empresas, dos vendedores, una partida borrada y una partida cruzada
deliberada (sin claves foráneas en el fixture para comprobar la defensa de
lectura). Las seis fallaban antes de la corrección y pasan después. Verifican
totales, margen, decisiones, filtro por vendedor, tenant inexistente y
anonimización del nombre de un autor ajeno. No usan Neon ni DATABASE_URL.

Validación: 461 pruebas pasan, 18 opt-in omitidas, excluido el E2E que requiere
DATABASE_URL; TypeScript y ESLint de los dos archivos modificados sin errores.
Para incluir las seis pruebas de SQL, ejecutar desde `cotiza-web`:
`PGLITE_MODULE=/ruta/temporal/pglite/dist/index.js npm test -- --exclude validate-quote-lifecycle.e2e.test.ts`.
La dependencia continúa siendo temporal y no se agregó al runtime del producto.

Sigue pendiente la prueba autenticada con dos tenants y vendedor, el recorrido
comercial completo y la revisión de procesos de fondo/legacy antes de declarar
cerrado el aislamiento de toda la plataforma o activar la integración CRM.

## Recorrido CRM contra PostgreSQL local desechable

El runner `scripts/check_crm_isolation.mjs` genera el esquema Prisma desde cero
en PGlite en memoria, aplica ambas migraciones y sirve el protocolo PostgreSQL
solo en loopback con un puerto aleatorio. Inyecta esa conexión nueva a los
tests; nunca reutiliza DATABASE_URL del entorno para conectarse a Neon. Al
terminar cierra el socket y la base. No se agregan dependencias al producto.

La suite nueva crea dos empresas ficticias, dos vendedores de la misma empresa
y un owner por empresa. Solo sustituye el contexto autenticado; ejecuta los
handlers API, servicios, Prisma, SQL, transacciones y claves foráneas reales.
No ejecuta un navegador, Clerk real, middleware ni tráfico HTTP de Vercel.

Se comprobaron cliente, cotización y oportunidad, nueva versión de cotización,
propuesta con reintento, lectura por vendedor/owner, tarea de seguimiento,
rechazo de padres cruzados, finalización autorizada, cierre/reapertura,
conservación de la creación de la oportunidad, KPIs y auditoría. Los IDs de
tenant y privilegios enviados en el cuerpo no cambian el contexto del servidor.

La prueba reprodujo y corrigió tres casos:

- Crear cotización con cliente ajeno ahora responde 404; se conserva el rollback
  que impide guardar la cotización y su oportunidad. Antes el error de relación
  escapaba del handler y provocaba un error interno.
- Generar propuesta comprueba permiso sobre la cotización fuente antes de
  escribir; un vendedor ajeno del mismo tenant recibe 404, no una propuesta.
- Repetir la generación de una propuesta existente comprueba también permiso
  sobre esa propuesta antes de devolverla o rellenar información. Ser dueño de
  la cotización fuente no concede acceso a una propuesta creada por otro actor.
  Owner/admin/superadmin mantienen su alcance autorizado dentro del tenant.

La consulta del folio de oportunidad reutiliza ahora el cliente de transacción
recibido, sin pedir otra conexión al pool mientras la creación mantiene una
transacción abierta. La reproducción inicial agotaba el tiempo de transacción
en el runner de una sola sesión. Este ajuste no convierte el contador actual
MAX+1 en una secuencia atómica ni acredita asignación concurrente de folios.

Resultado: los 12 casos nuevos de recorrido/aislamiento y los 10 casos
existentes de fechas comerciales pasan (22 en total). La suite general con los
seis tests SQL de KPIs mantiene 461 pruebas aprobadas; omite 30 casos opt-in,
incluidos los 22 ejecutados por separado. El E2E antiguo dependiente de
DATABASE_URL sigue excluido. TypeScript y ESLint de los archivos cambiados sin
errores. La concurrencia distribuida no queda certificada por el multiplexer
de PGlite. No se escribieron fixtures ni se alteraron cuentas reales en Neon.

Reproducción desde la raíz, con dependencias temporales:

```sh
npm install --prefix /tmp/cotiza-pg-review --no-audit --no-fund --save-exact \
  @electric-sql/pglite@0.5.11 @electric-sql/pglite-socket@0.2.14
PGLITE_MODULE=/tmp/cotiza-pg-review/node_modules/@electric-sql/pglite/dist/index.js \
PGLITE_SOCKET_MODULE=/tmp/cotiza-pg-review/node_modules/@electric-sql/pglite-socket/dist/index.js \
  node scripts/check_crm_isolation.mjs
```

El recorrido de backend queda validado con datos ficticios. Sigue pendiente el
recorrido en navegador con sesiones reales de dos tenants y vendedor, más las
revisiones abiertas de fondo/legacy. El PR conserva el estado de borrador y no
se aplicó esta corrección a producción ni se migró el CRM antiguo.
