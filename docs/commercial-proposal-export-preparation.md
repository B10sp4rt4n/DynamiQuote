# Preparación del exportador interno v0.1

Implementación aislada sobre PR #29: lectura SQL y exportación interna de
candidatos de propuestas ganadas. Sin endpoint, UI, jobs, migración, habilitación
de capacidades, consumo de IA ni conexión productiva durante las pruebas.
G0 sigue pendiente; la autorización de preparación no autoriza el corte.

## Interfaz y permisos

`prepareCommercialProposalExport({startUtc, endUtcExclusive})` resuelve identidad
Clerk, tenant y capacidad `commercial_chat_read` en el servidor. La capacidad
ausente deniega incluso a superadmin; este cambio no amplía su setter ni habilita
empresas. El módulo no tiene llamador en la aplicación desplegada.

Owner/admin/superadmin ven únicamente el tenant efectivo. El vendedor ve solo
su ID exacto; no hereda registros sin propietario. Es más estricto que algunos
KPIs heredados, sin modificar sus políticas. Costos/utilidad quedan reservados
de forma conservadora a esos roles privilegiados hasta acordar permisos finos.
Para el vendedor el SQL no lee `subtotal_cost` y la proyección vuelve a ocultarlo.
Se revalida identidad, tenant, capacidad y permisos tras la lectura y en cada
invocación. No hay caché, descarga, almacenamiento ni transporte implementados.

La solicitud no admite actor, tenant, permisos, SQL ni corte histórico. Instantes
UTC ISO exactos con milisegundos y Z; intervalo [inicio, fin). Ejemplo 2025 CDMX:
`2025-01-01T06:00:00.000Z` a `2026-01-01T06:00:00.000Z`. La traducción futura de
fechas naturales debe usar zona horaria, sin aplicar un offset fijo a otros años.

## Origen financiero y límites

`readCommercialExportRows` ejecuta un único SELECT parametrizado. Suma renglones
activos de `proposal_items.subtotal_price/subtotal_cost`, las columnas usadas
por los KPIs actuales, por propuesta antes de expandir documentos formales.
Hijos/enlaces están limitados por tenant; documentos duplicados no multiplican
montos. Sin renglones, o si alguno carece de monto, la suma permanece nula.
Nunca transforma faltantes en cero ni usa floats para calcular utilidad.
Subcentavos incompatibles fallan en vez de redondearse silenciosamente.

Fecha: `outcome_at`; solo la cohorte con el acto exacto
`legacy-creation-20261021:<proposal_id>` y tipo `historical_creation_reference`
usa creación como referencia auditada. Se conserva la diferencia con cierre
observado. Sin fecha, la propuesta se conserva como candidato sin atribuirla
al periodo. No se infiere cliente/moneda por nombre ni se hace conversión FX.

Salida `cotiza-proposal-export/0.1`: propuestas, importes, referencias opacas a
cotización/linaje/versión/cliente/moneda e incidencias. Enlaces ausentes, múltiples
o incompletos se marcan `UNRESOLVED_SOURCE_LINK`. Alternativas del mismo linaje
se conservan como candidatos: no se elige la mayor versión ni se suman como
ventas oficiales. Esa regla por venta independiente sigue pendiente.

Este formato NO es el `commercial_snapshot` universal ni una respuesta del
ranking v0.1. Siempre declara `coverage: not_certified`, incluso vacío. No
afirma cero ventas, totales, completitud, watermark, selección única, corte
histórico ni inmutabilidad. La observación usa el reloj local. No hay persistencia.

El hash local corresponde exactamente a `JSON.stringify(payload)` codificado
UTF-8, perfil `json-stringify-utf8/v1`. Verifica contenido, no autenticidad del
emisor ni custodia externa. No sustituye canonicalización/atestación universal.

Máximo 500 propuestas: el SELECT lee hasta 501 para detectar desbordamiento;
devuelve `limit_exceeded` sin datos en vez de truncar. Otros rechazos sin datos:
`forbidden`, `invalid_request`, `source_unavailable`, `invalid_source`. Las
excepciones del proveedor no se exponen. Paginación consistente pendiente.

## Pruebas reproducibles

Desde `cotiza-web`, tras instalar dependencias existentes y generar Prisma:

```bash
npm test -- lib/reports/commercial-proposal-export.test.ts
PGLITE_MODULE=/ruta/externa/a/pglite/dist/index.js npm test -- lib/db/commercial-export-source.integration.test.ts
npx tsc --noEmit
npx eslint lib/reports/commercial-proposal-export.ts lib/reports/commercial-proposal-export.test.ts lib/db/commercial-export-source.ts lib/db/commercial-export-source.integration.test.ts
```

PGlite 0.3.14 se instala fuera del repositorio, solo para pruebas; no modifica
las dependencias de despliegue. Sin PGLITE_MODULE la suite SQL se omite y no
puede acreditarse como ejecutada. Se ejecuta el SQL real con parámetros en
PostgreSQL desechable, reemplazando solo el cliente de conexión. No requiere
DATABASE_URL, usuarios reales, PAC ni clave IA. Las pruebas de autorización
simulan contexto Clerk/capacidad; no acreditan integración de identidad real.

Resultado local de este incremento: 36 pruebas nuevas aprobadas (28 de servicio
y 8 de SQL); suite CI existente con PGlite, 586 aprobadas/59 omitidas en 59 archivos
aprobados y 4 omitidos. Se usó la exclusión de CI
`--exclude validate-quote-lifecycle.e2e.test.ts`; esa suite E2E heredada requiere
DATABASE_URL y no se ejecutó. La ejecución inicial sin esa exclusión falló al
importarla por ausencia de DATABASE_URL, sin conectarse a ninguna base.
También pasaron las 88 pruebas Python de contratos, TypeScript, ESLint de los
cuatro archivos añadidos y `git diff --check`. No acredita CI remota ni producción.

## Continuidad

Antes del ranking: resolver selección oficial por venta independiente, conciliar
moneda/cliente/versiones y totales; acordar schema universal, atestación de origen,
revisión fuente, completitud, persistencia y paginación. Tras G0: validar permisos
reales y transacciones, implementar transporte autenticado y auditoría/revalidación
de acceso a derivados. Después podrán conectarse consultas y chat.

Este cambio no acredita respaldo/restore productivo, control de escritores
Railway, Digestor compatible desplegado ni liberación del CRM. PDFs, borradores
y correos conservan sus compuertas y autorizaciones originales.
