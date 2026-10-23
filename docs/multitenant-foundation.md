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
Faltan la conciliación de datos reales y la revisión completa de notas
históricas, procesos de fondo y funciones legacy Python. Las comprobaciones
posteriores de Clerk real, documentos, reportes/KPIs y visibilidad por vendedor
en la ficha 360 están registradas cronológicamente abajo; no certifican rutas
ni reglas de negocio ajenas a los casos probados.
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

## Evidencia en navegador con sesión real de superadmin

El 22 octubre 2026, con el código `1216cfdd1a91e3a53eeb526a2134a31515708d28`,
se abrió y verificó en navegador el despliegue Vercel
`dpl_43WggZbKxFgd71oMY3KYByMuafsS`. La URL probada fue
`https://dynami-quote-6rszs6t1c-salvador-ruiz-esparzas-projects.vercel.app`.
La configuración conserva el override DATABASE_URL exclusivo de la rama
`fix/multitenant-foundation` y la copia Neon `br-old-pond-ahe5jto3`.

La sesión real mostró SynAppsSys y permitió las acciones de superadmin. Los
cambios de contexto `sys → salsa` y `salsa → sys` quedaron registrados en la
copia Neon a las 23:49:47 y 23:50:41 UTC, con el mismo ID Clerk que el usuario
local activo de Salvador. Se recorrió el catálogo de SALSA (39 cuentas) y
se restableció SynAppsSys. Un cliente observado en el catálogo de SALSA se
intentó abrir directamente manteniendo el contexto SynAppsSys: la página
mostró «Cliente no encontrado». La captura está en
`docs/evidence/crm-cross-tenant-20261022.jpg`. Esto verifica el filtro de tenant
con superadmin; no sustituye una sesión real de vendedor u owner.

Se crearon exclusivamente en la copia aislada:

- Cliente ficticio `PRUEBA CRM MULTITENANT 20261022 - NO COMERCIAL`.
- Cotización `COT-0065`, guardado de una partida ficticia y versionado explícito
  a v2. Ambas versiones conservan la oportunidad `OPP-0063` con ID
  `0bcc5bb9-b546-47a1-8ed2-c268fcc20822` y el mismo cliente/tenant.
- Propuesta `PROP-2026-0282`, ID `70ea5502-e2d5-4007-885b-781bbdd539e3`,
  originada en v2. Se eligió MXN, se guardaron condiciones de prueba sin validez
  comercial y se sometió a aprobación interna. La pantalla y PostgreSQL
  confirman estado `approved`, costo 120, venta 200, utilidad 80 y margen 40%.
- PDF y Excel descargados desde sus botones. Se verificaron archivos no
  vacíos y firmas PDF/ZIP: 802168 y 18426 bytes respectivamente. La auditoría
  registra dos eventos `document_issued`. No se validó aquí la diagramación
  del PDF ni el contenido completo de las hojas. La espera inicial por un
  evento de descarga de la pestaña padre agotó su plazo: los botones abren
  una ventana, y los archivos sí llegaron al directorio compartido.

No se enviaron correos ni se timbró, invitó o reasignó a usuarios reales.
Al terminar este primer recorrido, la propuesta ficticia permanecía aprobada
internamente, sin desenlace comercial ni fecha de cierre (`outcome` y
`outcome_at` nulos). En ese momento aún no se había guardado ninguna tarea.
La continuación documentada abajo completa esas comprobaciones.

### Límite de esta sesión de prueba

Se abrió el modal de seguimiento, pero la carga de oportunidades no completó
su recorrido porque venció el acceso temporal de Vercel. Una pestaña nueva
abierta a esa ruta mostró el login de Vercel. No se atribuye por ello un
defecto al servicio de oportunidades ni se declara validado el selector.

La conexión de Vercel puede leer el despliegue; el helper de acceso protegido
falla al consultar aliases (403). Una llamada directa para acceso temporal
permitió inicialmente abrir Cotiza. La revisión automática rechazó después
crear/renovar un enlace compartible de 30 minutos por el riesgo de acceso
externo a un despliegue con datos internos. No se intentó sortear ese rechazo.
La alternativa de login normal con GitHub avanzó hasta segundo factor; la
solicitud segura del segundo factor se cerró sin completarse.

Para continuar se requiere una sesión normal de Vercel con su segundo factor,
o autorización explícita para un acceso temporal limitado a esta preview.
Los enlaces/tokens de acceso, cookies y credenciales no forman parte de la
evidencia. El estado original de empresa se dejó en SynAppsSys.

Pendientes: guardar/completar seguimiento, cierre y reapertura en pantalla,
comprobar las vistas 360/KPIs resultantes y probar sesiones reales distintas de
owner/vendedor. Las pruebas automáticas de esas operaciones siguen documentadas
arriba, pero no acreditan esos recorridos pendientes de navegador. Se conserva
el PR en borrador, sin liberar a producción ni migrar el CRM anterior.


## Continuación autorizada: seguimiento, cierre, KPIs y reapertura

El 23 octubre 2026 UTC, Salvador autorizó explícitamente 60 minutos de acceso
para la preview aislada. La renovación se completó usando la conexión Vercel
existente, sin desactivar la protección general del proyecto. La compilación
con la corrección de fecha se comprobó dentro de la misma ventana autorizada;
no se extendió el acceso a producción. No se registran enlaces secretos.

### Seguimiento y corrección de fecha

En la sesión real de superadmin se creó la tarea ficticia
`PRUEBA CRM 20261022 - validar seguimiento, sin contactar`, ID
`2e59dfb4-fbca-413e-8f37-caed900edf5f`, desde el catálogo de clientes.
El selector mostró exclusivamente la oportunidad abierta del cliente de prueba
`OPP-0063`; se guardó con ese cliente, oportunidad y tenant SynAppsSys. PostgreSQL
confirmó `due_date = 2026-10-23`.

La prueba detectó que Inicio y la ficha 360 mostraban el día anterior:
Prisma serializa la columna PostgreSQL DATE a medianoche UTC y los componentes
la convertían a la zona local del navegador. Se agregó un formateador específico
para días de vencimiento y se compartió entre ambas pantallas. La corrección no
cambia las fechas almacenadas ni las fechas de cierre comercial.

Validación del commit `5a802b97b02537ae8edba888d1289130169488fb`:

- Ocho pruebas pasan: tres casos de vencimiento ejecutados con zonas CDMX,
  UTC y Tokio, incluidos límites de año, más cinco pruebas existentes de cierre.
- TypeScript y ESLint de los cuatro archivos modificados terminan sin errores.
- La revisión React de los dos componentes conserva hooks, controles y flujo
  de finalización; el formateador no agrega dependencias ni consultas.
- Vercel confirmó READY para `dpl_HntnTnRr6hKcAqNwfXVscGRVo4Yz`, preview de
  la misma rama con el override de base aislada existente.
- Se inició sesión real mediante GitHub/Clerk en esa compilación y se verificó
  `vence 23 oct 2026` tanto en Inicio como en la ficha 360. Evidencia:
  `docs/evidence/crm-task-due-date-20261023.jpg`.
- Desde la ficha 360 se marcó hecha la tarea. PostgreSQL confirma
  `completed_at = 2026-10-23T00:19:45.320Z`, conservando los vínculos originales.
  La pantalla muestra «Sin tareas pendientes para este cliente». Captura:
  `docs/evidence/crm-task-completed-20261023.jpg`.

### Cierre comercial y reversión de KPIs

Sobre la propuesta ficticia `PROP-2026-0282`, se eligió «Marcar como ganada» y
se confirmó explícitamente el 22 octubre 2026, fecha de CDMX. La copia Neon
registró `outcome = won`, `outcome_at = 2026-10-22T06:00:00Z` y auditoría con
actor, fecha elegida y momento del registro. La ficha 360 mostró oportunidad
Ganada, fecha de cierre 22 octubre y 0 días al cierre.

| Momento | Revenue ganado | Margen de ganadas en pesos |
| --- | ---: | ---: |
| Antes del cierre ficticio | 832325.58 | 146310.33 |
| Con la propuesta ganada | 832525.58 | 146390.33 |
| Después de quitar el desenlace | 832325.58 | 146310.33 |

Los importes corresponden exclusivamente a la copia de validación. El incremento
fue exactamente venta 200 y utilidad 80. La tabla mensual mostró el cierre en
octubre; las demás propuestas y su referencia histórica no se modificaron.
Al usar «Quitar etiqueta», la fecha de cierre volvió a NULL, los KPIs regresaron
a su valor previo y la ficha 360 volvió a mostrar la oportunidad Abierta. Esta
primera prueba acredita reapertura del desenlace comercial.

Los dos eventos `outcome_changed` quedaron en auditoría a las
`2026-10-23T00:13:58.395Z` y `2026-10-23T00:14:46.834Z`, respectivamente,
con el mismo actor Clerk de la sesión real. La segunda entrada conserva el
cierre anterior y registra su eliminación. Al terminar ese primer ciclo, la propuesta permanecía aprobada internamente,
con `outcome` y `outcome_at` NULL; la tarea estaba completada.

También se probó el botón «Reabrir a borrador» en la compilación corregida. Se
volvió a marcar ganada la propuesta ficticia y se abrió el editor. La reapertura
cambió `status` de approved a draft, eliminó el desenlace y la fecha de cierre,
habilitó de nuevo las partidas y retiró las decisiones de aprobación activas.
El evento `outcome_changed` de `2026-10-23T00:21:29.512Z` registra
`trigger = workflow_status`, `nextStatus = draft`, el actor y la fecha anterior.
Los KPIs conservaron los valores originales de revenue/margen y la ficha 360
mostró oportunidad Abierta, propuesta Borrador y ninguna tarea pendiente.
Estado final de la propuesta: draft, con `outcome` y `outcome_at` NULL. Captura:
`docs/evidence/crm-workflow-reopened-20261023.jpg`.

El recorrido cliente → cotización/versiones → propuesta/documentos →
seguimiento → cierre → KPIs → reapertura tiene evidencia de navegador y datos
con superadmin en la copia aislada. Queda pendiente probar sesiones reales de
owner y vendedor, incluida la visibilidad comercial entre vendedores del mismo
tenant. La suite de backend documentada
arriba cubre esas reglas con contexto suministrado por el harness. Se conserva
el PR en borrador; esta evidencia no autoriza liberación ni migración a producción.


## Validación de roles y cierre de filtros por vendedor

Se utilizó la sesión Clerk real de Salvador en la preview
`dpl_HntnTnRr6hKcAqNwfXVscGRVo4Yz`. No se inició sesión en cuentas de otras
personas. En la rama Neon aislada `br-old-pond-ahe5jto3` se guardó el estado
original del usuario y de los fixtures, y se cambió temporalmente el rol local
de superadmin a owner, conservando su identidad Clerk y tenant SynAppsSys.
Esto prueba resolución y aplicación del rol owner con Clerk real; no equivale
a iniciar sesión con un segundo usuario owner distinto.

Para comprobar acceso del owner a la operación de otro vendedor se utilizó
la identidad ficticia `crm-role-peer-20261023`, inactiva, sin correo ni cuenta
Clerk, exclusivamente como propietario temporal de las dos versiones de
COT-0065, PROP-2026-0282 y OPP-0063. No se enviaron invitaciones. Como owner:

- Configuración mostró solo SynAppsSys, sin la opción global de cambiar a
  otra empresa ni de otorgar el rol superadmin.
- La ficha 360 mostró cotización, propuesta y oportunidad de ese vendedor
  ficticio, y permitió consultar el detalle de la propuesta.
- La apertura directa de un cliente de SALSA devolvió «Cliente no encontrado».

### Restauración y límite de la prueba de navegador

La revisión automática rechazó el cambio temporal siguiente a rol user
(vendedor), indicando que podía dejar el usuario con permisos diferentes del
superadmin original. No se reintentó ese cambio ni se usó una vía alternativa.
Se restauraron inmediatamente, mediante una transacción acotada:

- Rol superadmin y tenant SynAppsSys de Salvador.
- Autor original de ambas versiones de COT-0065 y de PROP-2026-0282.
- Propietario original de OPP-0063.

La respuesta PostgreSQL verificó cada ID restaurado. La ficha 360 del estado
restaurado se conserva en `docs/evidence/crm-role-restored-20261023.jpg`.
El usuario ficticio sigue
inactivo y sin acceso Clerk; no se borraron registros. La propuesta permanece
en borrador, sin desenlace ni fecha de cierre; la tarea continúa completada.
La prueba de navegador como vendedor está pendiente de autorización explícita
para bajar temporalmente ese rol en la copia y restaurarlo después, o de una
sesión legítima ya disponible de vendedor.

### Defectos reproducidos y corregidos sin cambiar permisos en Neon

La revisión de código y tres pruebas de regresión contra PostgreSQL/PGlite
local desechable demostraron que la ficha 360 y el endpoint del selector de
tareas omitían el alcance por vendedor. Además, POST /api/tasks aceptaba un
ID de oportunidad ajena del mismo tenant. Antes de corregir, los tres casos
fallaron: se obtenía la oportunidad privada y la petición de tarea devolvía
201 en vez de 404, creando una fila no autorizada.

Se aplicó el mismo alcance que Pipeline (`owner_user_id` del vendedor o NULL
para el legado sin asignar) a la ficha 360 y al selector de oportunidades.
Owner/admin/superadmin mantienen el alcance completo del tenant seleccionado.
El guardado de tareas comprueba también el propietario de la oportunidad y
rechaza con 404 antes de insertar. El permiso de alcance completo se deriva
del contexto autenticado del servidor; un canSeeAll o tenantId enviado en el
cuerpo no lo concede. Clientes y contactos conservan su catálogo compartido
por tenant; no se declara aquí auditado todo el acceso a notas históricas.

Validación de esta corrección:

- 26 casos de integración pasan contra esquema real Prisma y las migraciones
  multitenant: 16 CRM (cuatro nuevos) y 10 de ciclo comercial.
- Los casos nuevos cubren historial 360, selector API, rechazo sin escritura
  de una tarea con oportunidad privada y seguimiento permitido a owner.
- La suite general pasa 464 pruebas; omite 34 opt-in, incluidos los 26 corridos
  por separado. El E2E antiguo dependiente de DATABASE_URL sigue excluido.
- TypeScript y ESLint de los seis archivos modificados terminan sin errores.

El perfil vendedor todavía no tiene evidencia de navegador autenticado.
No se levantó el bloqueo de liberación ni se integró el CRM antiguo.


## Prueba de vendedor autorizada y completada en navegador

Después de la autorización específica de Salvador, se comprobó el commit
`b17f55665a8f8d030440c6fbb80a93c249c90b41` en el despliegue READY
`dpl_7FhN8LNBAtn4giqNioZDLW4HT4vr`, URL
`https://dynami-quote-jy15u7jd6-salvador-ruiz-esparzas-projects.vercel.app`.
El acceso temporal permaneció dentro de la ventana de 60 minutos previamente
autorizada. GitHub/Clerk autenticó la misma identidad real de Salvador.

En la copia Neon `br-old-pond-ahe5jto3`, su rol local pasó temporalmente de
superadmin a user a las `2026-10-23T00:47:15.420Z`. No se cambió Clerk ni se
inició sesión con credenciales de otra persona. Se validó el rol aplicado a
una sesión Clerk real, no la simultaneidad de dos usuarios reales distintos.

| Comprobación | Resultado observado |
| --- | --- |
| Operación propia en ficha 360 | Una oportunidad, una cotización y una propuesta; importe 200 y margen 40 % |
| Enlace directo a propuesta propia | Detalle de PROP-2026-0282 disponible |
| Seguimiento propio | Selector incluyó OPP-0063; tarea guardada y marcada hecha |
| Operación asignada al vendedor ficticio | Ficha 360 con cero oportunidades, cotizaciones y propuestas |
| Enlace directo a propuesta ajena | «Propuesta no encontrada» |
| PDF y XLSX de propuesta ajena | Ambos respondieron con JSON «Propuesta no encontrada» |
| API del selector con oportunidad ajena | Respuesta `{ "opportunities": [] }` |
| Cliente de otra empresa | «Cliente no encontrado» |
| Configuración como vendedor | Sin administración de usuarios/tenant; política de márgenes y guardado deshabilitados |
| KPIs como vendedor con operación ajena | «Mi desempeño», 85 propuestas |
| KPIs después de restaurar superadmin y propiedad | «KPIs del equipo», 86 propuestas |

Las dos versiones de COT-0065, PROP-2026-0282 y OPP-0063 se asignaron
transitoriamente al propietario ficticio e inactivo `crm-role-peer-20261023`
para los casos de rechazo, igual que en la prueba owner. Antes de esa
asignación se creó desde el navegador, con rol vendedor, la tarea
`PRUEBA ROL VENDEDOR 20261023 - NO CONTACTAR`, ID
`e09bf9b9-d890-4c2f-8d27-bbc414783a9b`. Conservó el cliente/opportunity/tenant
esperados, vencimiento 23 octubre y autor de la sesión. PostgreSQL confirmó
su finalización a las `2026-10-23T00:48:15.131Z`.

Capturas del mismo recorrido:

- `docs/evidence/crm-seller-own-20261023.jpg`: acceso permitido a operación propia.
- `docs/evidence/crm-seller-task-20261023.jpg`: tarea propia ligada a OPP-0063.
- `docs/evidence/crm-seller-peer-hidden-20261023.jpg`: operación ajena oculta.

Se restauraron en una transacción el rol superadmin, tenant original y todos
los propietarios originales de los fixtures a las
`2026-10-23T00:49:47.287Z`. La respuesta de PostgreSQL devolvió los IDs y
valores restaurados; una recarga de la sesión mostró de nuevo KPIs de equipo
con 86 propuestas. La propuesta sigue en draft con desenlace/fecha de cierre
NULL; ambas tareas ficticias están completadas. El usuario ficticio permanece
inactivo, sin correo ni acceso Clerk. Producción no participó en esta prueba.

Esta comprobación resuelve el pendiente anterior de navegador para el rol
vendedor y comprueba la corrección de alcance de la ficha 360/selector sobre
el código b17f5566. No se generó una petición manual de escritura forjada desde
el navegador: ese rechazo sin inserción está cubierto por el caso de regresión
contra PostgreSQL local con los handlers reales. No se reejecutan pruebas de
código por esta actualización exclusiva de evidencia. El PR sigue en borrador,
sin autorización de fusión/despliegue de producción ni migración del CRM antiguo.


## Revisión final y conciliación (22 octubre 2026, CDMX)

La conciliación de solo lectura agregó 119 comprobaciones por rama y encontró
legado sin asignación que impide declarar listo el despliegue. El informe
actual es `docs/multitenant-release-review-20261022.md`; contiene resultados,
correcciones posteriores de notas/logos/caché y límites de evidencia.

La reparación exacta de 12 documentos está preparada y ensayada únicamente
en PostgreSQL/PGlite local. No se aplicó a Neon. Los logos sin tenant necesitan
copias por empresa y revisión de referencias antes de desplegar el código
que elimina su fallback global. Las seis propuestas de default-tenant se
conservan sin atribuirlas a una empresa real. El PR permanece en borrador.
# Ensayo de conciliación de documentos y logos — 22 octubre 2026, CDMX

Actualización: reparación aplicada únicamente en `br-old-pond-ahe5jto3`;
producción `br-quiet-morning-ahkomhhi` continúa sin cambios.

- 12 documentos asignados por su cotización exacta: sys 6, salsa 6.
- Tras resolver esos tenants se identificaron 132 referencias a 41 logos
  globales; tres originales están compartidos. Se crearon 45 copias por tenant,
  con 45 auditorías de copia y 132 auditorías de referencia.
- Los 50 originales se conservan; cero referencias conocidas a un logo global
  o de otra empresa y cero copias divergentes. Los defaults existentes no cambian.
- Ambos scripts se ejecutaron dos veces sin duplicaciones ni cambios de auditoría.
  Las huellas de contenido documental y entidades comerciales se conservaron.
- Las seis propuestas `default-tenant` permanecen intactas y aisladas. El actor
  real sigue como superadmin; el usuario de pruebas continúa inactivo.
- Pasan las dos suites locales de reparación; se repitieron las 119 comprobaciones
  SQL de la copia y siguen validadas las 13 FK multitenant.

Ver `docs/multitenant-release-review-20261022.md` y
`docs/evidence/legacy-reconciliation-rehearsal-20261022.json` para recuentos,
huellas y límites. Falta comprobación visual en preview de logos históricos,
emisor de nuevas propuestas y los últimos cambios de notas/caché. PR #28 sigue
en borrador: no se fusionó ni se activó la integración en producción.
