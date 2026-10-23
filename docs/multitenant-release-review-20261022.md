# Revisión de liberación multitenant — 22 octubre 2026 (CDMX)

Estado: **mantener en borrador; no aplicar a producción todavía**.

Se revisaron el PR #28, el código de Cotiza y 119 comprobaciones SQL de solo
lectura tanto en producción `br-quiet-morning-ahkomhhi` como en la copia
`br-old-pond-ahe5jto3`, proyecto Neon `cool-resonance-22906937`.
El main consultado fue `55760ab4c4fa45ddf2c0f940694441ee129aefc6`.
No se ejecutó reparación, DDL ni cambio de permisos/datos en producción.
Los ensayos de reparación se ejecutaron exclusivamente en PGlite local desechable.

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

## Reparación de documentos preparada

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
**El script sigue siendo una propuesta: no se ha aplicado a ninguna rama Neon.**

## Validación y límites

- 32 pruebas de integración pasan: 22 CRM y 10 de ciclo comercial, con handlers,
  Prisma y PostgreSQL/PGlite reales; el harness suministra solo el contexto de auth.
- 464 pruebas generales pasan; 40 casos opt-in omitidos incluyen los 32
  ejecutados por separado. El E2E antiguo dependiente de DATABASE_URL se excluye.
- TypeScript sin errores. ESLint sin errores; conserva un aviso preexistente
  por `hasNonTermsContentUpdate` en proposals.ts.
- Ensayo de reparación local pasa, sin credenciales ni acceso a Neon.
- La evidencia previa de navegador corresponde al código probado en cada sección;
  las nuevas correcciones de notas/logos/caché aún requieren comprobación en preview.
- RLS no se habilita. Las funciones Python directas y lectores externos no se
  certifican como multitenant; no deben usarse para la integración.

Evidencia detallada: `docs/evidence/multitenant-readiness-20261022.json`.
Auditoría reproducible de solo lectura: `scripts/audit_multitenant_readiness.sql`.

## Secuencia para continuar

1. Ensayar el manifiesto documental y la copia de logos por tenant en la rama
   aislada, conservando auditoría y recuentos antes/después.
2. Mantener las seis propuestas sin empresa y sus dependencias aisladas hasta
   confirmar su origen; no incorporarlas a SynAppsSys ni a SALSA por suposición.
3. Comprobar en preview documentos con logos propios, notas privadas/compartidas,
   owner/vendedor y descarga, sin correos ni facturación real.
4. Revisar vínculos de usuarios y cerrar el inventario de escritores externos.
5. Revisar y aprobar el cambio final. Solo entonces aplicar migraciones/conciliación
   a destino y desplegar de forma controlada, conservando las restricciones en un rollback.

No migrar el CRM antiguo ni activar la integración en vivo hasta ese corte.
