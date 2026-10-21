# Fechas comerciales y tiempo de vida

La oportunidad conserva su `created_at` original a través de las versiones de
cotización y propuestas. `proposals.outcome_at` registra el instante UTC en que
se asigna un desenlace comercial, independientemente de `proposals.closed_at`,
que sigue perteneciendo al flujo interno de aprobación.

El pipeline conserva su regla de estado existente: ganada si alguna propuesta
ligada está ganada; en su defecto, perdida si alguna está perdida; abierta en
otro caso. Su cierre se deriva de la primera decisión vigente del estado
resultante. Si alguna decisión de ese estado no tiene fecha, el cierre y la
duración se muestran como desconocidos. No se usa `opportunities.closed_at`,
que el flujo actual nunca ha mantenido, como fuente alternativa.

El tiempo de vida cuenta períodos completos de 24 horas desde el inicio de la
oportunidad hasta el cierre derivado, o hasta la lectura para oportunidades
abiertas. Corregir/quitar el desenlace o reabrir una propuesta conserva la
decisión anterior en `proposal_audit_events` y recalcula el estado a partir de
las propuestas vigentes. Repetir el mismo desenlace no mueve la fecha.

Revenue y margen ganados se agrupan por el mes de decisión en Ciudad de
México; actividad propuesta/aprobada conserva el mes de creación. Las
decisiones históricas sin fecha siguen en los totales históricos, identificadas
por separado, y quedan fuera de las series de cierres mensuales. No se infiere
ninguna fecha a partir de creación, aprobación, emisión de PDF o facturación.

## Orden de publicación

1. Probar la migración `20261020_proposal_outcome_at.sql` en una rama aislada
   de la base existente, con datos representativos.
2. Aplicar ese mismo archivo a la base objetivo con conexión directa y parada
   ante cualquier error. Es una migración aditiva e idempotente; no rellena
   fechas históricas. El código anterior es compatible con la nueva columna.
3. Publicar el código únicamente después de completar la migración.
4. Verificar en el entorno objetivo: marcar ganada, repetir, corregir a
   perdida, reabrir y consultar pipeline y KPIs. Usar registros de prueba.

No usar `prisma migrate deploy` para introducir esta migración aislada: este
repositorio no tiene una línea base de Prisma Migrate. No ejecutar `db push`
contra producción como sustituto de la revisión del SQL.

## Verificación local

Las pruebas normales no se conectan a una base. La prueba de integración se
habilita sólo con `COTIZA_TEST_DATABASE_URL`, restringida a localhost, y crea
registros con identificadores `lifecycle-*`. Requiere una base local vacía y
desechable con el esquema actual y la migración aplicada:

```sh
COTIZA_TEST_DATABASE_URL=postgresql://usuario:clave@127.0.0.1:5432/cotiza_pruebas \
  npx vitest run lib/db/opportunity-lifecycle.integration.test.ts
```

La base operativa ya contiene `proposal_approvals.executed_by_user_id`, usado
por los helpers de aprobación aunque aún no declarado en el esquema Prisma.
Una base generada desde cero requiere agregar esa columna de texto para
reproducir el flujo actual. No se cambia esa estructura productiva en este
ajuste. No habilitar `validate-quote-lifecycle.e2e.test.ts` contra una base real.

# Referencia histórica para KPIs (21 de octubre de 2026)

`20261021_legacy_outcome_creation_reference.sql` registra una etiqueta de auditoría
por propuesta ganada/perdida anterior al inicio del 21 de octubre en Ciudad de
México que no tiene `outcome_at`. Por instrucción del usuario, esos registros
usan `created_at` como referencia mensual del histórico. No representa una
fecha real de cierre ni modifica el tiempo de vida de la oportunidad.

Es idempotente y sólo agrega eventos `historical_creation_reference`; conserva
identificadores, creación, aprobación interna, desenlaces e importes. Los KPIs
dan prioridad a `outcome_at` cuando existe. Una reapertura conserva la etiqueta
como evidencia; una nueva decisión se registra con su fecha real y prevalece
sobre la referencia histórica. Los registros sin fecha y sin etiqueta siguen
mostrándose como «Sin fecha».

Validar primero en una copia de producción, comparar conteos/importes y el hash
de los campos originales; ejecutar dos veces para comprobar idempotencia. La
etiqueta es compatible con el código anterior; aplicar antes del despliegue
del código que la consume. No hay DDL ni dependencias nuevas.
