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
La comprobación en preview de esta revisión queda pendiente de compilación.

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
