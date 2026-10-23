# Corte de integración CRM / Cotiza

Estado: preparado para revisión; **no autorizado para ejecución productiva**.
El PR #28 sigue en borrador. Este documento no autoriza migraciones, cambios de
permisos, interrupciones de servicios, correos, facturación ni publicación.

Acceso habitual aclarado por Salvador: https://dynami-quote.vercel.app/cotizaciones.
La API Vercel lo resolvió a producción/main/55760ab4, deployment
dpl_GvKryAuSHx1QQe22MNAUymSiUKwG. Se retira la inferencia conversacional de que
trabajaba en Railway. El plan conserva su enlace y mantiene abierto el inventario
de otros consumidores del servicio antiguo.

## Criterio de salida

| Frente | Evidencia existente | Condición restante |
| --- | --- | --- |
| Memoria AUP local | Cierre y reapertura con contenido verificado; transacción y alteraciones probadas | Sin acuse externo Recordia ni custodia HotVault |
| Notas y contexto | Otra empresa no abre la ficha; vendedor ve nota general y owner ambas; rol y propietario restaurados | Evidencia limitada al caso ficticio y rutas comprobadas |
| Documentos históricos | Muestra PDF previa y 12 documentos reparados en copia | No certifica todos los documentos ni una moneda original NULL |
| Emisor nuevo | Tres escenarios de integración y PROP-2026-0283 ficticia en navegador/PDF | No designa razón social ni perfil default por el usuario |
| Identidad | Cinco IDs encontrados por ID exacto en Clerk; login vigente de superadmin probado; alta sin reasignación por correo | Aprobar lista de usuarios que operarán al lanzamiento, verificar solo sus IDs/logins/roles; mantener pendientes y legacy sin vincular ni darles acceso |
| Facturación | Reserva, bloqueo de resultado incierto y conciliación incorporados; evidencia histórica del checkpoint f3683dc8 en crm-fiscal-validation-f3683dc8.md y CI posterior en el PR | Validar/desplegar Digestor compatible antes del corte; no se probó timbrado remoto real |
| Otros escritores | Railway SUCCESS/instancia conectada; host/base del runtime coinciden con Neon productivo; snapshot, build y huellas capturados | Código Git exacto desconocido; controlar/parar y drenar Railway por separado; inventario externo no cerrado |
| Mantenimiento y recuperación | Pausa y reanudación de dos rutas probadas en Preview con sesión real; preparación de fuente fija y HTTP local comprobados | Respaldo de base y parada/drenado de todos los escritores; sin restauración DB ni rollback de código del hosting probado |
| Manifiestos | 7 comprobaciones sin discrepancias en producción/copia; control negativo detectado | Repetir en destino al corte, dentro de ventana sin escrituras |

La muestra nueva guardó venta 100/costo 60 y usa emisor DynamiQuote sin logo
cuando solo hay copias históricas no predeterminadas. Su PDF de dos páginas se
descargó y renderizó completo. Quedó en borrador y sin desenlace. Un fallo previo
de guardado no se reprodujo después de iniciar sesión en la preview vigente;
la lógica de guardado no cambió y no se atribuye una causa sin logs.

Comprobaciones de código: 40 casos de integración local y TypeScript pasan.
ESLint de página 360 y prueba nueva pasa. La revisión completa de client-shell
encuentra un error anterior `react-hooks/set-state-in-effect` al sincronizar logos;
no fue introducido por la línea `timeZone`, no se ocultó ni se declara corregido.

No convertir una condición pendiente en aprobación implícita. Las seis
propuestas `default-tenant` y sus dependencias permanecen aisladas. Los 39
desenlaces sin fecha no se rellenan por suposición. No se importan datos QA.

## Alcance simplificado: usuarios actuales vs. datos de prueba

Decisión de negocio confirmada el 23 de octubre de 2026: no invertir esfuerzo
en reconciliar o migrar cuentas e información **identificadas y aprobadas como
prueba**. Conservarlas aisladas mientras no haya una aprobación separada para
eliminación. Esta regla no autoriza borrar documentos, facturas o registros
comerciales de producción que no estén clasificados individualmente.

Lectura SQL **solo de metadatos y contadores** del 23/10/2026, sin escribir datos:
- 9 filas activas de `app_users`: 5 IDs con formato Clerk; 3 IDs `pending_*`
  y 1 ID legacy. El formato no certifica sesión real de cada persona.
- 12 documentos históricos con `formal_proposals.tenant_id IS NULL`; **2**
  registran `delivered_at` o `delivery_hash`. No asumir que son borrables.
- 1 propuesta con `invoice_uuid` o estado `stamped` en el tenant SynAppsSys
  (`sys`). Conservar comprobante y XML, sin timbrar ni regenerar.
- 42 propuestas ganadas de tenants válidos (5 sys, 37 salsa); su carácter de
  prueba/comercial debe establecerse por procedencia, no por el estado o edad.
- 0 solicitudes HTTP observadas durante siete días en Railway, pero el servicio
  continúa `SUCCESS` con **1 réplica** y memoria en uso; no demuestra ausencia
  de clientes SQL directos, procesos en curso o consumidores ocultos.

La lista de usuarios de lanzamiento debe aprobarse a partir de identidades
verificadas y acceso comercial vigente. Las cuentas de prueba no deben aparecer
en esa lista ni migrarse al CRM. Antes de ampliar el acceso, verificar login
real de cada usuario **incluido**, su empresa y la denegación cruzada. No usar
identificación inferida ni correo como sustituto del ID Clerk.

La conciliación de documentos y logos ya ensayada sigue siendo una opción
segura para preservar operación histórica; no ejecutarla solo para rescatar
datos de prueba innecesarios. Si se plantea omitir alguna reparación, se
requiere evidenciar que no afecta documentos comerciales o fiscales y que el
código nuevo los mantiene inaccesibles hasta su clasificación. No suprimir
las 13 claves ni asumir que una FK con valores NULL protege esos documentos.

Pruebas de código reproducibles para `4f0f442`:
https://github.com/B10sp4rt4n/DynamiQuote/actions/runs/39953644283
`tsc`, Prisma, 544 pruebas generales aprobadas, 51 de integración con
PostgreSQL desechable y 12 escrituras cruzadas rechazadas. La validación no
reemplaza ensayo de usuarios reales, respaldo ni drenado de escritores.

Para el corte siguen exigidos: clasificación previa, inventario de escritores
externos, aislamiento y drenado de Railway, respaldo/punto de recuperación
ensayado, repetición de preflight en destino y autorización final explícita.
No ejecutar migrations, depuración o despliegue productivo por esta nota.

## Preparación antes de solicitar la liberación

La preparación actual está en docs/crm-release-preparation-20261023.md: fuente
e122c48a restaurada (425 archivos), CI success, cuenta de Salvador activa y
SHA desplegado de Digestor 9e251d76 atribuido por Railway. Siguen pendientes
respaldo real de ambas bases, metadatos de almacenamiento fiscal y lista de
operadores. La lectura Vercel más reciente devolvió 403; no se revalidó el alias.
Los checkpoints anteriores de esta página son históricos, no fallback aprobado
que permita omitir correcciones posteriores de privacidad, concurrencia o timbrado.

1. Fijar SHA exacto de aplicación y hashes de los cuatro SQL de abajo. Identificar
   despliegue productivo, proyecto y rama de base por valores de conexión
   comparados de forma privada; no copiar credenciales al expediente.
2. Definir explícitamente los operadores reales que se habilitarán desde el
   primer día y probar **sus** sesiones Clerk por ID exacto, tenant y rol.
   Los tres `pending_*` y el ID administrativo legacy no necesitan recuperarse
   cuando se confirmen como pruebas excluidas; siguen sin vincularse, sin
   invitaciones ni facultades nuevas. No fusionar por nombre, alias o correo.
   Excluir una cuenta del alcance **no** es autorizar su borrado, y una fila
   `app_users.active=true` no acredita por sí misma que sea un operador real.
3. Confirmar qué atiende `cotiza-web` en Railway: servicio
   `7b8c668c-d093-42e0-a418-ce2ddc7c652d`, proyecto
   `1980096f-8e39-416b-8a12-45b5815af5a6`, entorno production
   `79506dd6-a076-4104-911a-9167da50040d`. El despliegue
   `1e21faa5-0be3-4ceb-9235-12eacd65c925` conserva una instancia conectada.
   La inspección del runtime confirmó host/base de Neon productivo
   `br-quiet-morning-ahkomhhi`/neondb. Fue publicado por CLI; no hay repo conectado
   ni SHA Git verificable. Proxy empaquetado anterior a la pausa actual y cuatro
   archivos distintos del candidato nuevo. No asumir que tiene sus controles.
   Evidencia: `docs/evidence/crm-railway-writer-verification.json`. Confirmar
   consumidores e integraciones y aprobar su parada/drenado durante el corte.
4. Inventariar integraciones, scripts y puestos que conservan credenciales de
   base. El guard de `app.py` contiene ese entrypoint legacy, no llamadas directas
   a bibliotecas Python. Las FK protegen relaciones; no autorizan lecturas ni
   impiden a un escritor antiguo omitir el contrato AUP. RLS permanece desactivado.
5. Usar el candidato de recuperación y la pausa HTTP descritos abajo. El ensayo
   remoto de dos rutas está completado con identidad real en Preview. Aún falta
   preparar respaldo de base y comprobar parada/drenado de otros escritores.
   No se ha ensayado un rollback en producción.
6. Presentar versión, destino, impacto, procedimiento, responsables y evidencia;
   obtener la aprobación de liberación cuando todos los bloqueos estén cerrados.

## Ejecución propuesta, únicamente después de aprobación

La validación aislada de Digestor 074523e5 pasó 32 casos en PostgreSQL 17;
25 comprobaciones dirigidas del cliente/rutas Cotiza también pasan. Ver
docs/digestor-compatibility-20261023.md. No certifica respuesta PAC real,
credenciales ni compatibilidad del runtime actualmente publicado.

Antes de esta ejecución, validar y desplegar Digestor Fiscal compatible con
GET /v1/billing/drafts/{draft_id}/stamp-result (PR #2 de digestor__fiscal aún
borrador al verificar). El trabajo de Cotiza PR #5 ya está incorporado al
candidato CRM con autorización por vendedor y conservación de evidencia fiscal;
no fusionar ese PR por separado sin conciliar sus cambios. Esta revisión no
fusionó ni desplegó esos PR originales. La evidencia de f3683dc8 es histórica:
no volver a ese checkpoint omitiendo los arreglos de privacidad/concurrencia
posteriores. Ver docs/crm-fiscal-validation-f3683dc8.md.

1. Establecer una ventana de mantenimiento con todos los escritores identificados
   detenidos mediante su procedimiento aprobado. Esta versión incorpora
   `CRM_MAINTENANCE_MODE=paused` para cerrar el tráfico HTTP antes de los handlers,
   incluidos GET y webhooks. No detiene clientes directos, otros builds/servicios,
   trabajos de fondo o solicitudes ya iniciadas. Comprobar su drenado y verificar
   el 503 en todos los destinos. No hay un flag universal de base de datos.
2. Capturar respaldo/punto de recuperación y metadatos del destino actual. Una
   restauración completa posterior podría perder operaciones nuevas, por lo que
   requiere una decisión explícita; no es una recuperación automática por defecto.
3. Ejecutar solo lectura: `scripts/audit_multitenant_readiness.sql` y
   `scripts/preflight_crm_cutover.sql`. Todos los siete contadores de discrepancia
   de preflight deben ser cero. Si cambian fuente, tenant, documento o referencia,
   detener el corte y regenerar/revisar el manifiesto; no forzar la reparación.
   Ejecutar además scripts/audit_invoice_rollout.sql y revisar estados fiscales
   desconocidos, stamping pendiente o evidencia incoherente. No borrar ni
   rellenar UUID/XML por suposición. Son controles adicionales, no sustituyen
   los siete contadores del preflight CRM.
4. Con conexión directa al destino verificado y parada ante cualquier error,
   aplicar en este orden, respetando cada BEGIN/COMMIT del archivo:
   - `cotiza-web/prisma/manual/20261022_multitenant_foundation.sql`.
   - `cotiza-web/prisma/manual/20261022_multitenant_documents.sql`.
   - `scripts/repair_legacy_formal_tenants.sql`.
   - `scripts/repair_legacy_logo_tenants.sql`.
   Las dos migraciones son aditivas; cada reparación tiene sus propias guardas
   transaccionales. No afirmar atomicidad entre los cuatro archivos. Las
   migraciones no incorporan por sí mismas las seis propuestas de tenant inválido.
5. Antes de abrir tráfico, repetir auditoría, preflight y
   `scripts/verify_legacy_reconciliation.sql`. Comprobar 13 FK validadas,
   12 documentos conciliados, 45 copias y 132 referencias auditadas según el
   manifiesto aprobado; 0 imágenes cruzadas y originales intactos. Si la
   manifestación aprobada cambia, usar sus cantidades revisadas, no estos números.
6. Publicar/promover exclusivamente el artefacto aprobado. Conservar las variables
   de producción verificadas; no promover DATABASE_URL ni otros valores de preview.
7. Probar login exacto, tenant/vendedor, notas, cotización/versión, propuesta,
   PDF/XLSX, cierre, corrección de fecha, KPIs y reapertura con datos ficticios
   identificados. No enviar correos ni timbrar facturas reales como smoke test.
8. Registrar resultados, reabrir tráfico y observar errores, accesos denegados,
   referencias documentales y consistencia de actos. Una ruta que falla mantiene
   bloqueada su liberación; una prueba local no sustituye el resultado remoto.

## Recuperación ante fallo

| Momento | Respuesta |
| --- | --- |
| Antes de aplicar SQL | Cancelar el corte sin cambiar producción |
| Dentro de un archivo SQL | Su transacción se revierte; revisar error sin eliminar registros |
| Entre archivos | Mantener cerradas las escrituras; verificar qué transacciones se confirmaron y reanudar solo tras corregir la causa |
| Código nuevo falla | Mantener aislamiento y restricciones; corregir hacia delante o usar exclusivamente artefacto de recuperación verificado |
| Problema de pertenencia | Corregir vinculación exacta después de verificar identidad; no recuperar fallback por nombre/correo ni owner anónimo |

No quitar FK, auditorías, copias de imágenes ni actos para hacer funcionar un
rollback. No restaurar un build anterior al aislamiento o que vuelva a escribir
UUID como si fuera huella de contenido. Conservar copias y referencias reparadas
es una compatibilidad deliberada, no una razón para sobrescribir originales.
Sin un artefacto de recuperación seguro ensayado, el corte sigue bloqueado.

Evidencia de esta revisión: `docs/evidence/crm-release-followup.json` y
`docs/evidence/crm-writer-route-inventory.json`. La instantánea no demuestra
ausencia de procesos externos ni autorización para usarlos en la integración.
El ensayo visual autorizado por roles está en
`docs/evidence/crm-notes-role-verification.json`; confirma también la restauración
de superadmin y del propietario original de OPP-0063 en la copia aislada.


## Candidato de recuperación y pausa HTTP

Código: commit remoto `d65414698f56d94c57aba8d543a11749a3cc1753`, árbol
`af2fc5592398bd124c89017c8fbf76a2c2891c70`. El commit local de la misma fuente es
`8e1e0f82794d115e99bd3fc39079af90ac0d12dc`; se comprobó igualdad de árboles.

`node scripts/prepare_crm_recovery.mjs <SHA-completo-disponible-localmente> <directorio-absoluto-nuevo>`
crea un archivo de fuente desde Git, lo extrae y compara SHA-256 de cada archivo
contra el commit. Solo incluye archivos versionados, no variables de entorno,
dependencias ni respaldo de base. Detiene la preparación si encuentra un archivo
`.env` versionado distinto de `.env.example`. No conecta servicios ni despliega.
El manifiesto de este ensayo está en
`docs/evidence/crm-recovery-source-manifest.json`.

Se restauraron y comprobaron 384 archivos. La fuente restaurada compiló con
`next build --webpack`. Se reutilizaron las dependencias locales existentes por
symlink; no se verificó una instalación limpia de dependencias. El build restaurado
se ejecutó con `next start` en loopback, con Clerk deshabilitado y DATABASE_URL
ficticia e inaccesible. Pasaron 11 rechazos HTTP 503 y dos comprobaciones de
reanudación (401 al crear cotización sin sesión; 200 al diagnóstico de webhook).
El mismo conjunto pasó con `next dev`. Esto no verifica autenticación real,
lectura/escritura remota, restauración de base ni rollback del hosting.

La variable `CRM_MAINTENANCE_MODE` ausente, vacía o `off` deja continuar el
middleware existente. `paused` y cualquier otro valor no vacío tras trim cierran
la aplicación con 503, `Retry-After: 300` y `Cache-Control: no-store`. El control
abarca todos los métodos y páginas/API de esta versión; excluye recursos internos
`_next/static`, `_next/image` y favicon. No hay excepción por rol o cabecera de
usuario. Al pausar también se interrumpen entradas de webhooks: comprobar
reintentos y conciliación antes de reabrir.

En un despliegue aislado, establecer la variable en el entorno correcto y
redeplegar según el mecanismo del proveedor; no asumir efecto instantáneo por
editarla. Comprobar 503 antes de migrar y esperar el drenado. Para reabrir, usar
`off` en ese mismo destino, desplegar y comprobar login y alcance. No se ha
activado esta variable remotamente ni en producción en este ensayo.

El alta por `/api/settings/users` ya no vincula una identidad encontrada por
correo ni reasigna una pertenencia existente. El correo encontrado responde 409
antes de escribir o enviar. Un ID explícito exige superadmin, verificación por ID
exacto en Clerk, coincidencia de correo verificado y cuenta habilitada. El alta
local mantiene sus conflictos por ID/alias. Se ensayó con Clerk simulado; no
resuelve por sí sola las cuentas actuales ni certifica otros flujos de usuarios.

Evidencia adicional: `docs/evidence/crm-maintenance-recovery-verification.json`,
`crm-maintenance-development-http.json`, `crm-recovery-production-http.json` y
`crm-recovery-build.log`. Repetición HTTP local: `node scripts/check_crm_maintenance.mjs`.


## Diagnóstico de identidad preparado; permisos pendientes

Código remoto `aee0b0d4962cc98f076b29474a3796abf5b5516a`, árbol
`2037573c2a9f901d7f2ee69913c8daa9eb17fe92`. Preview
`dpl_64rTpxKfpNXFJAixGoL6WK3bMsbd` READY, conectada a la misma copia aislada
por comparación privada de host/base/rol. `GET /api/settings/users/identity-audit`
requiere superadmin local exacto y solo consulta al proveedor. No expone correos
ni cambia identidades; distingue IDs encontrados, ausentes, bloqueados, legacy y
pendientes. Las invitaciones se relacionan por ID local y tenant exactos; una
página incompleta queda señalada. No prueba login individual ni concede acceso.

Las nueve cuentas activas coinciden entre producción/copia en ID, alias, rol,
tenant y correo normalizado. Se repitió la lectura al final: ambas permanecen
intactas. La ruta remota respondió `No autorizado` sin sesión. No se completó la
consulta autenticada: la revisión automática rechazó pulsar Authorize clerk para
B10sp4rt4n, aplicación Clerk Development & Staging Instances, scopes read:user y
user:email. El motivo fue falta de autorización explícita verificable de esos
permisos de perfil y correos. El consentimiento queda preparado para revisión;
no se usó otro método como rodeo.

Se creó CRM_MAINTENANCE_MODE solo en preview y rama fix/multitenant-foundation.
No llegó a ejecutarse el redespliegue: la API rechazó target=preview (400; se omite
ese campo para preview), y el intento corregido fue rechazado por revisión
automática. Su motivo no quedó recuperable en el resultado retenido. La variable
se devolvió a `off`; el deployment anterior sigue READY. Las 14 variables con
alcance production conservan sus metadatos de ID, tipo, destino y actualización.
No hay prueba de pausa/reanudación remota y no se declara recuperación del hosting.

La nueva fuente se restauró de commit fijo y verificó 391 archivos; Vercel compiló
el mismo árbol. Pasan 14 pruebas nuevas, 502 generales y TypeScript/ESLint del
cambio. No se repitieron los 40 casos DB previos al no cambiar sus servicios.
Evidencia: `docs/evidence/crm-identity-release-followup.json`, manifiesto de fuente
`crm-identity-recovery-source-manifest.json` y `crm-oauth-consent-pending.jpg`.
Antes de continuar se necesita aprobación concreta del consentimiento OAuth y de
los redespliegues de preview para pausar y reabrir. La producción sigue fuera del
ensayo y el PR continúa en borrador.


## Cierre posterior del consentimiento y consulta real de Clerk

Salvador autorizó los dos pasos del requerimiento concreto mediante «adelante».
El consentimiento OAuth de GitHub/Clerk quedó completado con una solicitud nueva.
La pantalla Inicio de la preview aee0b0d4 confirmó sesión real, tenant SynAppsSys
y un usuario habilitado de ese tenant. El diagnóstico autenticado de solo lectura
respondió nueve filas: cinco IDs exactos encontrados en Clerk; cuatro correos
locales coinciden con un correo verificado del proveedor. En salvador.ruiz esa
coincidencia no se verificó; su sesión e ID exacto sí funcionaron. No inferir cuál
correo difiere ni modificar el contacto o la vinculación por ese resultado.

Los tres pending (ma.glz, e.hdz y ruben.arroyo) no tienen coincidencia de invitación
pendiente por ID local y tenant exactos en la consulta completa. Esto no afirma
que no exista otra invitación ajena o con otra metadata. El ID legacy admin no
se buscó por correo y sigue sin vincular. No se comprobaron logins individuales
de los otros cuatro usuarios ni se enviaron invitaciones/correos del CRM.

El redespliegue aislado volvió a ser rechazado por revisión automática pese a la
autorización. El motivo retenido es la omisión de un destino explícito, que el
control considera insuficiente para garantizar preview. La referencia oficial
https://vercel.com/docs/rest-api/deployments/create-a-new-deployment documenta la
omisión como preview y la respuesta target=null como preview. El origen también
se confirmó mediante listado filtrado por preview, branch y SHA; la revisión
mantuvo el rechazo. No se cambió a production ni a un entorno staging distinto.
Se restauró el flag a off tras cada intento; no se creó despliegue pausado.

Se inició la alternativa de revisar el formulario de Vercel para seleccionar
Preview explícitamente. El acceso seguro eligió GitHub, pero Vercel solicitó
2FA de autenticador; la solicitud segura quedó declinada y no se repitió. No se
capturaron códigos o tokens en el expediente ni se ejecutó un redespliegue por UI.
Falta completar ese acceso para inspeccionar y ejecutar el mecanismo seguro.

Las nueve pertenencias siguen idénticas entre producción/copia y sin cambios;
los metadatos de las 14 variables con alcance productivo coinciden con la línea
base. Evidencia: crm-identity-provider-verification.json y
crm-identity-provider-observed.json; captura crm-identity-signed-in.jpg. Este
cierre posterior resuelve el bloqueo OAuth anterior y conserva el del ensayo
remoto. El historial anterior permanece como evidencia de su momento.

## Ensayo remoto de pausa y reanudación completado por UI

Tras la solicitud posterior de ayuda de Salvador se completó el acceso seguro
de Vercel. El formulario seleccionó Preview explícitamente para la misma rama
fix/multitenant-foundation y fuente aee0b0d4, conectada a la copia Neon
br-old-pond-ahe5jto3. Esto resolvió la ambigüedad de destino que había rechazado
la revisión automática de la API; no se repitió aquella llamada con target omitido.

Con CRM_MAINTENANCE_MODE=paused, dpl_5pBjtHaXSQn5YpWHVEpB4rbx2mNf quedó
READY y el navegador mostró CRM_MAINTENANCE en GET /inicio y GET
/api/settings/users/identity-audit. No se midió el código HTTP numérico remoto;
el 503 está comprobado en fuente y pruebas HTTP locales anteriores.

Se restauró el flag exclusivamente preview/rama a off y se redesplegó la misma
fuente mediante el selector Preview. dpl_FRWsmsRs25yTCFqTwTPJEzLP9hGE quedó
READY. El login GitHub/Clerk con los permisos existentes terminó en Inicio de
SynAppsSys con sesión real y un usuario habilitado. El diagnóstico autenticado
volvió a responder read_only=true y nueve usuarios a las 04:58:09.475Z del
23 de octubre de 2026. Conserva los pendientes de identidad anteriores.

Producción conserva dpl_GvKryAuSHx1QQe22MNAUymSiUKwG/main/55760ab4;
los metadatos de sus 14 variables siguen iguales. Las nueve pertenencias,
incluido el correo normalizado comparado privadamente, están intactas e iguales
en ambas bases. No se cambió código ni se repitieron las 502 pruebas.
El ensayo acredita el ciclo HTTP de esas dos rutas y redespliegue de fuente fija;
no restaura base, no certifica rollback de código del hosting ni detiene
escritores externos o solicitudes en curso.

Evidencia: docs/evidence/crm-maintenance-ui-rehearsal.json y las capturas/consulta
referidas en su manifiesto. Este cierre posterior resuelve el bloqueo de 2FA y
el ensayo remoto documentados antes, conservando su historia. El PR permanece
borrador. Faltan identidades pending/legacy, revisar el contacto de Salvador sin
alterar su ID funcional, confirmar destino/código de Railway, respaldo de base,
cierre/drenado de escritores, preflight de corte y aprobación final.
Recordia sigue local_only, sin acuse externo ni custodia HotVault.

## Railway: destino productivo y runtime comprobados

La revisión de solo lectura del 23/10/2026 resolvió el destino que antes ocultaba
OAuth. El panel permitió mostrar temporalmente DATABASE_URL, devolver únicamente
host/base y volver a ocultarla. El endpoint corresponde a
br-quiet-morning-ahkomhhi del proyecto Neon cool-resonance-22906937, base neondb.
La consola conectó a la instancia b8c988d3-4bd2-4524-bf01-2da847ee3be9 del
despliegue 1e21faa5-0be3-4ceb-9235-12eacd65c925 y confirmó el mismo host/base
en su entorno real. No se abrió conexión SQL ni se probó un permiso de escritura.
No se conservaron contraseña o cadena completa de conexión.

El servicio fue publicado por railway up y no tiene repositorio conectado.
Runtime sin RAILWAY_GIT_COMMIT_SHA ni directorio .git; build Next
Ts24dU6Pr2C-bnMwpNZWi. Snapshot d7b4ebc5-4a68-4e44-a85a-ddd1dc4a6f4d.
Logs de build conservan Next.js 16.2.4, Prisma Client 7.10.0 y digest de imagen
cc3922b22bd165e32874192f4aa1a281d560296d748bf1cc02b5e13a81a06096.
Estos identifican artefactos observados; no certifican un commit Git completo.

Las huellas de package.json, proxy.ts, contexto y alta de usuarios difieren del
candidato nuevo. La de proxy.ts coincide exactamente con el proxy de
main/55760ab4, anterior al límite de mantenimiento; los otros tres archivos no
coinciden con esa línea base. No atribuir por ello todo el build a main/55760ab4.
El flag no está definido en el runtime y el proxy fuente empaquetado no incorpora
la pausa nueva. No se fingerprintó por separado el proxy compilado. Cambiar el
flag en Vercel no detiene esta instancia independiente de Railway.

Métricas de 24 h muestran memoria distinta de cero; HTTP de siete días registra
cero solicitudes y los logs DNS/red/runtime de la ventana consultada están
vacíos. Es ausencia de registros, no prueba de inactividad o ausencia de trabajos
de fondo. El panel mostró estados transitorios contradictorios y un aviso de
incidencia de plataforma; la consola finalmente conectó. No se atribuye una
causa al aviso ni se usa el estado transitorio para declarar detenido el servicio.

Antes del corte: confirmar si alguien usa el dominio Railway o integraciones
que lleguen a él; fijar el plan aprobado de parada/drenado del despliegue exacto,
conservar snapshot/digest y comprobar que no quedan instancias o solicitudes
iniciadas escribiendo. Eliminar un dominio por sí solo no detiene el proceso.
No desactivar el servicio, rotar sus credenciales compartidas ni sustituirlo por
un build antiguo por deducción. Una recuperación anterior a migraciones debe
revalidar destino y artefacto; después del corte no reintroducir este runtime sin
los controles nuevos aunque la plataforma indique canRollback=true.

Evidencia: docs/evidence/crm-railway-writer-verification.json,
crm-railway-runtime-observed.json y crm-railway-runtime.jpg. Sin stop/restart,
redespliegue, variables cambiadas, migración, invitación, correo o factura.
No cambió código de aplicación ni se repitieron las 502 pruebas anteriores.
El destino queda resuelto; control/drenado del escritor, Git exacto, otros
escritores, identidades y aprobación de corte permanecen abiertos.
