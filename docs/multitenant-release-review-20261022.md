# Revisión de liberación multitenant — 22 octubre 2026 (CDMX)

Estado: **mantener en borrador; no aplicar a producción todavía**.

Se revisaron el PR #28, el código de Cotiza y 119 comprobaciones SQL de solo
lectura tanto en producción `br-quiet-morning-ahkomhhi` como en la copia
`br-old-pond-ahe5jto3`, proyecto Neon `cool-resonance-22906937`.
El main consultado fue `55760ab4c4fa45ddf2c0f940694441ee129aefc6`.
No se ejecutó reparación, DDL ni cambio de permisos/datos en producción.
Los ensayos de reparación se probaron primero en PGlite local desechable y
después se aplicaron únicamente a la rama aislada `br-old-pond-ahe5jto3`.

## Datos comprobados

| Hallazgo de producción | Cantidad | Tratamiento |
| --- | ---: | --- |
| Clientes | 62 | Catálogo por tenant |
| Oportunidades | 163 | Relaciones cliente/tenant sin cruces detectados |
| Propuestas totales | 206 | Incluyen los seis registros legacy sin empresa válida |
| Versiones de cotización | 368 | Consultas agrupadas dentro del tenant |
| Propuestas con tenant inexistente | 6 | Todas usan `default-tenant`; conservar aisladas, sin asignar una empresa por nombre |
| Partidas/nodos asociados al tenant inexistente | 2 partidas y 2 nodos | Preservar con las propuestas originales |
| Documentos sin tenant | 12 | Cotización de origen válida y exacta; manifiesto de reparación preparado |
| Logos/perfiles sin tenant | 50 | 43 de cliente y 7 de emisor; no tratarlos como biblioteca pública |
| Referencias con tenant conocido a logos globales | 119 | Preparar copias por tenant y actualizar referencias explícitas |
| Logos globales usados por más de un tenant conocido | 1 | Impide asignar simplemente el original a una sola empresa |
| Folios de grupo compartidos por diferentes tenants | 64 | Conservar folio; su identidad incluye tenant |
| Cotizaciones con autor inexistente | 11 | Dos IDs históricos; no inventar correspondencia Clerk |
| Oportunidades con autor inexistente | 2 | Mismos dos IDs históricos |
| Cotizaciones sin autor | 121 | Legado; no atribuir a un vendedor automáticamente |
| Propuestas ganadas/perdidas sin fecha real de cierre | 39 | Preservar la política histórica existente; no inventar fechas |
| Usuarios activos con ID de formato Clerk | 5 | Formato no prueba existencia en Clerk |
| Usuarios activos pendientes / ID legacy | 3 / 1 | Completar vinculación administrativa o conservar acceso denegado |
| Claves FK nuevas validadas en producción / copia | 0 / 13 | Aplicar solo durante la liberación aprobada |

La comprobación de referencias cliente/oportunidad/documento no encontró
mezclas entre tenants en las relaciones protegidas por las 13 claves. El indicador
`formal_proposals.quote_id_invalid = 12` se debe al tenant NULL del documento:
las 12 cotizaciones padre sí existen. No son doce cotizaciones huérfanas.

Las seis propuestas de `default-tenant` fueron creadas entre el 3 y el
10 de febrero de 2026, con usuario `default-user` y origen manual. Ninguna
tiene documento formal; dos contienen una partida. Es evidencia de procedencia
legacy, no una confirmación de que se puedan borrar. No se crearon empresas
ficticias para hacer pasar la conciliación.

La consulta de triggers no encontró triggers de usuario en el esquema public.
El repositorio no configura crons en vercel.json; la ruta de alertas revisada
resuelve contexto y alcance de vendedor. Esto no acredita tareas externas
configuradas fuera del repositorio ni certifica todas las funciones Python.
El entrypoint legacy sigue contenido por su guard de base compartida.

## Correcciones cerradas en código durante esta revisión

1. La eliminación de una cotización acota la entrada de búsqueda por los IDs de
   versión autorizados. Un folio repetido en otra empresa ya no borra su caché.
2. Las notas ligadas a una oportunidad siguen la privacidad de esa oportunidad.
   Un vendedor no puede leerlas ni adjuntar nuevas notas usando un ID ajeno.
   Las notas generales del cliente se mantienen compartidas dentro del tenant.
3. La eliminación de notas exige autor u owner/admin/superadmin y verifica el
   cliente indicado en la ruta. No se puede eliminar una nota ajena cambiando
   solo el ID del recurso.
4. La creación de propuestas y la lectura de imágenes dejan de usar perfiles
   con tenant NULL como fallback. Logos de otro tenant o sin asignación no se
   incorporan al documento; las imágenes propias siguen funcionando.

Cinco pruebas de regresión fallaron con el comportamiento anterior. Después del
arreglo pasan, junto con un caso positivo adicional de logos propios.

**Efecto operativo a resolver antes de producción:** los documentos que todavía
referencian logos globales podrían mostrarse sin imagen con este código.
Por eso no se libera este cambio sin conciliar esas referencias. No se reasignan
los 50 originales a una empresa: un mismo original ya tiene referencias de
varias empresas. La estrategia propuesta es copiar por tenant a partir de sus
referencias exactas, conservar el original y actualizar únicamente los vínculos
de ese tenant. Los activos sin referencia permanecen aislados.

## Reparación de documentos ensayada en Neon aislado

`scripts/repair_legacy_formal_tenants.sql` contiene un manifiesto explícito
de los 12 documentos y su cotización padre: 6 para sys, 6 para salsa.
La asignación se obtiene del ID de cotización ya vinculado, no de nombres,
correos ni similitud de empresas. No crea oportunidades ni modifica importes,
fechas comerciales o contenido documental.

El script:
- bloquea las filas del manifiesto y sus cotizaciones mientras comprueba el vínculo;
- aborta si falta un documento, cambia la cotización/tenant o hay una asignación conflictiva;
- registra tenant anterior, tenant asignado y cotización origen en una auditoría persistente;
- actualiza solo esos documentos cuyo tenant es NULL;
- puede repetirse sin duplicar la auditoría y deja intactos los documentos fuera de la lista.

Se probó con `scripts/check_legacy_formal_repair.mjs`: 12 reparaciones,
documento fuera del manifiesto sin cambios, segunda ejecución idéntica y
rollback completo cuando diverge la cotización o la asignación existente.
Se ejecutó dos veces en la rama aislada: los 12 documentos quedaron asignados,
con 12 registros de auditoría y sin duplicación en la segunda ejecución.
Se conservaron los 282 documentos y el hash de todo su contenido excluyendo
únicamente el campo tenant que se reparó. Producción conserva sus 12 tenants NULL.

## Copia de logos ensayada en Neon aislado

Después de reparar los documentos, las referencias con empresa conocida pasan
de 119 a **132**. El manifiesto explícito identifica **41 originales**, de los
cuales **3** se comparten entre empresas, y **45 pares original/tenant**.
La diferencia respecto al primer inventario se debe a los documentos cuyo
tenant antes era NULL. Las 132 referencias son campos de documentos formales;
en este conjunto no hubo referencias globales desde clientes.

`docs/evidence/legacy-logo-repair-manifest-20261022.json` fija cada referencia,
tenant, original, ID de copia y huella del original completo. El generador offline
`scripts/build_legacy_logo_repair.mjs` produce `scripts/repair_legacy_logo_tenants.sql`.
La transacción verifica el manifiesto, bloquea los tres tipos de tabla implicados,
crea las copias sin cambiar sus bytes/formato/metadatos históricos y actualiza
únicamente los campos de referencia explícitos. Conserva los originales y los
logos predeterminados existentes; las copias tienen `is_default=false`.
Registra los 45 pares y las 132 referencias anteriores/nuevas en dos tablas
de auditoría. Un conflicto cancela también las escrituras y la creación de auditoría.

Se ejecutó dos veces en la rama aislada. Resultados:

| Comprobación | Resultado |
| --- | ---: |
| Documentos sin tenant | 0 |
| Documentos conservados | 282 |
| Copias creadas / auditorías de copia | 45 / 45 |
| Referencias reparadas / auditorías de referencia | 132 / 132 |
| Referencias conocidas a logos globales o de otra empresa | 0 / 0 |
| Copias con bytes, formato, empresa, tenant o default incorrectos | 0 |
| Logos antes / después | 81 / 126 |
| Originales globales conservados sin cambios | 50 |
| Originales globales sin uso en el manifiesto | 9 |
| Propuestas sin empresa válida conservadas | 6 |
| Comprobaciones de la auditoría general repetidas | 119 |
| Claves FK multitenant validadas en la copia | 13 |

Las huellas de cotizaciones, propuestas, oportunidades, contenido documental,
clientes excluyendo el campo de logo, originales globales y las seis propuestas
sin empresa coinciden antes/después. Las huellas de las tres auditorías no
cambian al repetir las transacciones. El usuario real conserva su rol superadmin
y el usuario sintético permanece inactivo.

`scripts/check_legacy_logo_repair.mjs` verifica en PostgreSQL/PGlite una imagen
compartida entre dos tenants, los dos campos documentales y un cliente,
preservación e idempotencia. Prueba rollback completo ante cambios de fuente,
tenant o referencia, colisión de ID, referencia fuera de manifiesto y auditoría
conflictiva. También verifica que el SQL generado coincida con el manifiesto real.

Evidencia antes/después y lectura de producción:
`docs/evidence/legacy-reconciliation-rehearsal-20261022.json`.
Verificación reproducible: `scripts/verify_legacy_reconciliation.sql`.
La lectura de producción confirma 12 documentos sin tenant, 81 logos y ausencia
de las nuevas auditorías: **ninguna de estas reparaciones se aplicó a producción**.

Las copias históricas no certifican una razón social ni designan un emisor
predeterminado nuevo. Antes de la liberación se revisará también el emisor de
nuevas propuestas: DynamiQuote no tenía logos propios antes de este ensayo,
y la aplicación puede elegir un emisor propio no predeterminado cuando no hay default.

## Validación y límites

- 32 pruebas de integración pasan: 22 CRM y 10 de ciclo comercial, con handlers,
  Prisma y PostgreSQL/PGlite reales; el harness suministra solo el contexto de auth.
- 464 pruebas generales pasan; 40 casos opt-in omitidos incluyen los 32
  ejecutados por separado. El E2E antiguo dependiente de DATABASE_URL se excluye.
- TypeScript sin errores. ESLint sin errores; conserva un aviso preexistente
  por `hasNonTermsContentUpdate` en proposals.ts.
- Ambos ensayos locales pasan, sin credenciales ni acceso a Neon; ambos scripts
  también se ejecutaron dos veces, de forma idempotente, en la rama aislada.
- La evidencia previa de navegador corresponde al código probado en cada sección;
  las nuevas correcciones de notas/logos/caché aún requieren comprobación en preview.
- RLS no se habilita. Las funciones Python directas y lectores externos no se
  certifican como multitenant; no deben usarse para la integración.

Evidencia detallada: `docs/evidence/multitenant-readiness-20261022.json`.
Auditoría reproducible de solo lectura: `scripts/audit_multitenant_readiness.sql`.

## Secuencia para continuar

### Primer contrato de acto comercial AUP / memoria local

La revisión AUP/Recordia añadió un contrato versionado en el payload existente
de decisiones, correcciones de fecha y limpieza del cierre/reapertura. La
decisión y su evento se escriben en la misma transacción; errores de auditoría
cancelan también la modificación comercial. Se conservan los tipos/campos
anteriores y no se alteran registros históricos.

Cada acto identifica tenant, propuesta, oportunidad cuando existe, actor/rol,
estado anterior/nuevo, regla aplicada, momento de acción/registro y fecha
comercial con su precisión/procedencia. Conserva referencias locales y enlaza
correcciones/revocaciones con el evento previo. El payload completo usa SHA-256
con marcador `aup1:sha256:`; la lectura verifica contenido y la interfaz señala
una discrepancia sin presentar el payload alterado como decisión confiable.

Recordia figura como `local_only`, sin acuse externo; las referencias históricas
no se inventan ni se migran en este alcance. No se conecta HotVault ni se afirma
custodia, firma o inmutabilidad. La huella local no protege frente a reescritura
de datos y huellas por un administrador de base.

Pasaron 468 pruebas generales y 39 de integración contra PostgreSQL/PGlite
local. Se probaron rollback de decisión y reapertura ante falla de inserción,
detección de alteración, vínculo de corrección, preservación de fechas,
aislamiento y reintentos concurrentes (un acto y un conflicto). TypeScript y
ESLint sin errores, conservando el aviso previo documentado.
Contrato y límites: `docs/commercial-act-contract.md`.
La compilación AUP `25bdc442` quedó READY y se completó la comprobación en
preview con Clerk/GitHub autorizado por Salvador. En SynAppsSys, la propuesta
ficticia PROP-2026-0282 pasó por aprobación interna, cierre como ganada y
reapertura a borrador. Los dos actos nuevos mostraron «Registro local: contenido
verificado». La consulta de lectura confirmó secuencias 1 y 2; la segunda revoca
la primera y conserva su SHA-256 como precedente. El primer acto referencia un
evento legacy sin atribuirle una huella verificada.

Guardar de nuevo la misma fecha no duplicó el acto. No se ensayó una fecha
distinta en navegador porque la oportunidad nació el mismo día comercial de
la prueba; la corrección con cambio de fecha está cubierta por la integración
local. El estado final quedó `draft`, `outcome = NULL`, `outcome_at = NULL`,
confirmado en pantalla y mediante SQL de lectura en la copia aislada. Los actos
permanecen en el historial. No se enviaron correos, no se facturó ni se alteró
producción. Evidencia: `docs/evidence/crm-aup-browser-qa.json`,
`docs/evidence/crm-aup-won-verified.jpg` y `docs/evidence/crm-aup-restored.jpg`.

### Revisión posterior del emisor y muestra documental

La sesión real de superadmin volvió a entrar en la preview de `b977f0b`.
Se inspeccionó PROP-2026-0211 (SynAppsSys / UNITAM), que referencia una copia
histórica de emisor. La descarga de navegador produjo un PDF válido de dos
páginas; se renderizó la primera y se comprobaron emisor, receptor e imagen
de UNITAM. Su moneda original era NULL: se usó MXN solo como valor de ensayo
en la copia aislada y se restauró NULL inmediatamente después. El PDF de QA
no acredita la moneda comercial. No se envió correo ni se facturó.

La revisión de selección encontró un problema adicional: DynamiQuote no tiene
emisor predeterminado, y el fallback por `uploaded_at` elegía la copia histórica
de EQUIPOS Y LIMPIEZA DE ALTO NIVEL SA DE CV. La nueva prueba de integración
reprodujo la selección incorrecta antes del arreglo.

Se excluyen los IDs reservados `crm-legacy-logo:` del fallback automático de
perfil e imagen. Una copia puede usarse si se designa explícitamente como default;
las referencias explícitas de documentos históricos siguen funcionando.
Los perfiles ordinarios propios conservan su fallback actual. Si solo existen
copias históricas, las nuevas propuestas usan el nombre del tenant sin ese logo.
No se modifica la razón social, los defaults ni las imágenes en Neon.

Validación después del arreglo: 35 casos de integración aprobados, incluidos
tres nuevos casos (solo copias históricas, copia designada como default y perfil
ordinario propio), 464 pruebas generales, TypeScript y ESLint sin errores.
ESLint conserva el aviso preexistente de `hasNonTermsContentUpdate`.
Queda comprobar el comportamiento corregido en la nueva compilación de preview.
La publicación inicial fue rechazada por requerir autorización explícita del
repositorio y rama. Salvador la otorgó para B10sp4rt4n/DynamiQuote,
fix/multitenant-foundation, PR #28. Se utiliza el conector GitHub autorizado
porque la terminal no dispone de credenciales. Producción no cambió.
La restauración de moneda NULL también se confirmó después de recargar en
navegador: `docs/evidence/crm-issuer-restored-20261023.jpg`.
La muestra visual no certifica los 282 documentos ni los doce documentos sin
`proposal_id`, que no tienen una ruta directa en el frontend actual.

1. Comprobar en preview documentos históricos con las copias de logos y el
   emisor de nuevas propuestas, notas privadas/compartidas, owner/vendedor y
   descarga, sin correos ni facturación real. La ventana temporal de acceso
   anterior terminó; este ensayo SQL no la renovó.
2. Mantener las seis propuestas sin empresa y sus dependencias aisladas hasta
   confirmar su origen; no incorporarlas a SynAppsSys ni a SALSA por suposición.
3. Revisar vínculos de usuarios y cerrar el inventario de escritores externos.
4. Refrescar manifiestos y comparar cambios de producción antes del corte; no
   ejecutar el manifiesto de la copia contra datos que hayan divergido.
5. Revisar y aprobar el cambio final. Solo entonces aplicar migraciones/conciliación
   a destino y desplegar de forma controlada, conservando las restricciones en un rollback.

No migrar el CRM antiguo ni activar la integración en vivo hasta ese corte.

## Seguimiento: privacidad, emisor nuevo y preparación del corte

Se repitieron las 119 comprobaciones de solo lectura en producción y copia.
Producción mantiene 281 documentos, 12 con tenant NULL, 81 logos y 6 propuestas
de tenant inválido. La copia conserva las reparaciones anteriores; sus diferencias
adicionales corresponden a fixtures de QA. Los manifiestos vigentes de 12 documentos,
45 copias y 132 referencias pasan los siete contadores de
`scripts/preflight_crm_cutover.sql` en ambas ramas. Alterar deliberadamente un
hash en una consulta SELECT de control produce dos discrepancias de fuente;
no se modificaron datos ni el manifiesto canónico.

Dos notas ficticias se crearon en el cliente QA de SynAppsSys: una general y
otra ligada a OPP-0063. Superadmin las ve en edición y ficha 360. Al cambiar a
DynamiQuote mediante el selector, la misma ficha responde «Cliente no encontrado»
sin notas. El selector usa una recarga completa. La prueba visual de vendedor y
owner sigue pendiente: la revisión automática rechazó el UPDATE temporal de rol
y propietario por falta de autorización específica. La lectura posterior confirma
superadmin y propietario originales, sin cambios. Las pruebas locales de filtros,
creación cruzada y eliminación de notas siguen pasando.

Se detectó una diferencia de fecha en notas: la ficha 360 usaba zona del servidor
y mostraba día 23, frente al 22 por la noche en edición. `11698a20` fija
America/Mexico_City para ambos formatos, sin cambiar el instante UTC ni las fechas
comerciales. La nueva preview quedó READY y, con login Clerk/GitHub real autorizado,
mostró 22 oct 2026, 8:50 p.m. en ambas notas. Capturas antes/después conservadas.

En DynamiQuote se creó COT-0023 ficticia y PROP-2026-0283. La sesión anterior falló
dos veces al guardar partidas y la consulta confirmó que no persistieron; con
sesión nueva en preview vigente el guardado respondió éxito y persistió venta
100, costo 60 y margen 40. No hubo cambio en la lógica de guardado y no se afirma
una causa del fallo previo. Los logs Vercel devolvieron 403, no ausencia de errores;
no había CLI autenticada disponible. Un caso adicional reproduce POST y PUT de
primera partida en PostgreSQL/PGlite y verifica rechazo de otro tenant: **40 casos
de integración pasan**. TypeScript pasa. ESLint de página 360 y prueba nueva pasa;
client-shell conserva el error previo de sincronización de logos
`react-hooks/set-state-in-effect`, ajeno a la línea de zona horaria añadida.

La nueva propuesta usa emisor DynamiQuote e issuer_logo_id NULL. Se eligieron MXN
y condiciones NO COMERCIAL para este fixture nuevo. El PDF de 2 páginas se
descargó, extrajo y renderizó completo: sin logo ajeno, emisor correcto, marca
BORRADOR, subtotal 100 y total con IVA 116. El evento de descarga del navegador
agotó su espera aunque el archivo apareció correctamente en el directorio
sincronizado; no se repitió la descarga. La propuesta quedó draft y sin desenlace.
La preview vigente se restableció a SynAppsSys; la sesión anterior que no confirmó
restauración se cerró. No se enviaron correos ni se facturó.

Inventario actualizado: 38 rutas mutadoras, 37 con llamada de contexto y webhook
Clerk con verificación de firma. Es un inventario estático de llamadas, no una
certificación de cada rama de autorización. El catálogo de producción no mostró
funciones públicas, triggers de usuario ni extensiones de programación. La única
conexión observada fue pgbouncer/neondb_owner; una instantánea no enumera todos
los clientes con credenciales. Railway mantiene cotiza-web SUCCESS, deployment
1e21faa5-0be3-4ceb-9235-12eacd65c925, sin cron ni cambios pendientes. OAuth oculta
DATABASE_URL y el origen/commit no está expuesto: no se ha demostrado qué base
usa o que tenga las protecciones actuales. Los logs HTTP/DNS vacíos tampoco
demuestran inactividad. Este frente permanece abierto.

Identidades por resolver: e.hdz (owner, fumicontrol), ma.glz (owner, salsa),
ruben.arroyo (user, salsa) usan pending_*. El superadmin legacy admin de
DynamiQuote conserva su UUID; no se fusiona con Salvador por compartir correo.
Los otros cinco IDs tienen formato Clerk, lo que no verifica su existencia; solo
el login real del superadmin tiene evidencia en este ensayo. No se modificó ni
invitó a estas cuentas.

Procedimiento y condiciones de parada/recuperación: `docs/crm-cutover-runbook.md`.
Incluye orden foundation → documents → formal repair → logo repair, contraste de
destino, ventana sin escritores, conservación de restricciones y prohibición de
volver al resolver permisivo. La ejecución del corte sigue bloqueada hasta cerrar
identidades/escritores y ensayar recuperación segura; no se implementó ni ensayó
un modo de mantenimiento universal. El procedimiento preparado no es autorización.

Evidencia: `docs/evidence/crm-release-followup.json`,
`docs/evidence/crm-writer-route-inventory.json`, capturas `crm-notes-*`,
`crm-issuer-dynamiquote-verified.jpg` y `crm-issuer-dynamiquote-qa.pdf`.

### Cierre del ensayo visual de notas por rol

Salvador autorizó expresamente cambiar temporalmente salvador.ruiz a vendedor y
owner y reasignar OPP-0063 al usuario ficticio inactivo, únicamente en
br-old-pond-ahe5jto3, con restauración al terminar. El estado anterior de rechazo
y pendiente descrito arriba no se elimina; este ensayo posterior lo resuelve.

Se bloqueó y validó el estado inicial antes de aplicar las dos modificaciones en
una transacción. Como vendedor (role user), una recarga real de la ficha 360
mostró Oportunidades (0) y la nota general. La nota ligada a OPP-0063 no estaba
en el DOM. Como owner, manteniendo la oportunidad asignada al peer, otra recarga
mostró la oportunidad y ambas notas. La cotización/propuesta siguieron visibles
para el vendedor por su propia autoría; no se afirma que se ocultaran con este
cambio de propietario de oportunidad.

La restauración de superadmin y propietario original fue atómica y se contrastó
con el estado inicial. SQL confirmó role superadmin, tenant sys, cuenta activa,
owner_user_id original, peer inactivo y exactamente las dos notas QA. La pantalla
de Configuración volvió a mostrar SynAppsSys, selector de empresas y la fila de
salvador.ruiz con superadmin. No se modificaron notas, otros usuarios ni producción.

Evidencia: `docs/evidence/crm-notes-role-baseline.json`,
`docs/evidence/crm-notes-role-verification.json`,
`docs/evidence/crm-notes-seller-verified.jpg` y
`docs/evidence/crm-notes-owner-verified.jpg`. El ensayo no cambia el código de
aplicación 11698a20 ni amplía su cobertura a todas las rutas o perfiles. Siguen
abiertos el cierre de identidades, destino/código de escritores externos y ensayo
de mantenimiento/recuperación segura antes de autorizar producción.


## Continuación: altas de identidad y recuperación local

Se encontró en el alta de usuarios un camino que, al encontrar correo en Clerk
y un ID ya existente en la base, podía reasignar pertenencia/rol al tenant destino
y borrar la fila provisional. Se eliminó ese comportamiento: correo coincidente
responde 409 antes de crear; un ID explícito exige superadmin y verificación de ID,
correo verificado y estado habilitado en Clerk. No se cambia metadata ni se
reasigna una cuenta ante conflicto local. Las pruebas usan proveedor simulado;
no se crearon usuarios reales, invitaciones ni correos.

Producción se consultó solo mediante SELECT: siguen nueve usuarios activos, cinco
IDs con formato Clerk, tres pending y un UUID legacy. Solo Salvador tiene login
real comprobado en el alcance previo. No hay credenciales Clerk locales para
validar el resto contra el proveedor. Railway se revisó por lectura: sigue SUCCESS
el deployment 1e21faa5-0be3-4ceb-9235-12eacd65c925, una réplica us-west2,
sin cambios preparados. No expone commit fuente ni destino de DATABASE_URL.

Se incorpora pausa HTTP antes de auth/handlers mediante CRM_MAINTENANCE_MODE,
incluyendo GET, mutaciones y webhooks. Dev y build de producción restaurado pasaron
cada uno 13 comprobaciones HTTP locales (11 cierres, dos de reanudación). No cubre
otros escritores, procesos de fondo ni operaciones ya iniciadas; no se activó
remotamente. Se restauraron 384 archivos de un commit fijo y se verificó cada hash;
el build restaurado compiló con webpack y dependencias locales compartidas.
No se ensayó instalación limpia, base restaurada ni rollback del proveedor.

Validación de esta continuación: 488 pruebas generales aprobadas y dos omitidas;
63 pruebas dirigidas de identidad, contexto y proxy incluidas en esas generales;
TypeScript y ESLint de los TS cambiados pasan. Los 40 casos de integración DB
anteriores no se repitieron al no modificar servicios DB/contrato.
Código remoto d65414698f56d94c57aba8d543a11749a3cc1753, árbol
 af2fc5592398bd124c89017c8fbf76a2c2891c70. Evidencia y límites en
`docs/evidence/crm-maintenance-recovery-verification.json` y runbook actualizado.
El PR sigue borrador y producción no se modificó. Se conserva el historial de
pendientes anterior; mantenimiento/recuperación quedan probados localmente y
pendientes en el despliegue aislado antes de solicitar el corte.
