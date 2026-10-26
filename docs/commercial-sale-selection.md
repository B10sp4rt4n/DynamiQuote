# Selección de propuesta ganada por trato — preparación v0.1

Regla interna `cotiza-unique-won-deal/0.1`, propuesta para el adaptador fuente de
Cotiza. No cambia decisiones comerciales, no limpia etiquetas existentes y no
está habilitada en producción. Continúa PR #31 sobre PR #29; G0/G1 siguen abiertos.

## Qué demuestra el código de origen

- `lib/db/quote-editor.ts`, creación de versiones: conserva `quote_group_id` y
  `opportunity_id` de la versión anterior; el número mayor no prueba una venta.
- `lib/db/opportunities.ts`, `createOpportunityForTenant`: crea identidad de
  trato al originar una cotización; el comentario documenta una oportunidad
  nueva por grupo. Las versiones siguientes heredan esa oportunidad.
- `lib/db/proposals.ts`, creación desde cotización: guarda `origin` igual al
  quote_id y hereda opportunity_id. `proposal_derivations` conserva antecedentes
  entre propuestas de versiones del mismo grupo, sin acreditar cuál ganó.
- `setProposalOutcomeByTenant` registra `won` por propuesta. No exige que otra
  propuesta del mismo trato deje de estar ganada. Los agregados actuales suman
  esas propuestas sin una selección por trato. Este cambio NO los modifica.

Por ello la preparación no elige por mayor versión, fecha reciente, importe,
factura o posición en una cadena de derivación. Usa la etiqueta comercial won
registrada en Cotiza; no certifica aceptación del cliente, facturación ni cobro.

## Regla conservadora

1. Se resuelve contexto activo en servidor, capacidad y permisos. Para probar
   unicidad esta primera regla exige alcance completo del tenant. Un vendedor
   conserva la exportación propia, pero su selección queda
   `SELECTION_SCOPE_NOT_COMPLETE`. Su SQL no consulta ni devuelve conteos de
   otros vendedores, ni siquiera un booleano que revele su existencia.
2. La propuesta debe tener un único enlace documental consistente: quote_id
   igual a proposals.origin, grupo explícito, versión entera positiva, cliente
   estable y moneda MXN/USD. Documentos duplicados con los mismos datos se
   colapsan por DISTINCT en el origen; enlaces contradictorios se bloquean.
3. Proposal y quote deben tener el mismo opportunity_id. Si existe, la oportunidad
   debe existir en el tenant y su cliente conocido debe coincidir con el cliente
   de la cotización. No se rellena automáticamente un vínculo ausente.
4. El SQL cuenta propuestas won distintas en todo el tenant, sin limitarse al
   periodo consultado: por oportunidad de proposal/quote o por grupo de cotización.
   Busca también enlaces formales cuando origin no identifica la cotización.
   Una ganada de otro año sigue siendo un conflicto, y los documentos repetidos
   no multiplican el conteo. No cuenta perdidas/abiertas/descartadas.
5. Exactamente una ganada permite `selected`; cero, varias o conteo desconocido
   producen `unresolved`, sin elegir una arbitrariamente. No suma propuestas
   conflictivas ni las borra. El exportador conserva candidatos para conciliación.
6. La referencia de venta se deriva de [tenant, tipo de identidad, opportunity_id].
   Solo si ambas referencias de oportunidad son NULL usa el grupo explícito
   como `legacy_quote_lineage`. El hash evita colisiones por concatenación y
   separa namespaces, pero no autentica el origen ni sustituye permisos.
7. El servicio rechaza dos registros seleccionados con el mismo sale_ref, incluso
   si los conteos del origen contradicen esa duplicidad.

`selected` significa **selección única del candidato según el estado actual
del origen y esta regla**. Todavía debe evaluarse fecha, monto, costo, moneda,
periodo, cobertura y frescura para el ranking. No se reconstruyen decisiones
históricas con el estado actual ni se certifica completitud de una cartera.

| Caso | Resultado |
| --- | --- |
| v1 ganada y v2 borrador, mismo trato | Selecciona v1 |
| v1 y v2 ganadas, aun con cierres en años distintos | Ambas pendientes de conciliación |
| Mismo cliente, dos oportunidades independientes con una ganada cada una | Dos referencias de venta distintas |
| Dos grupos bajo una oportunidad, ambos con ganada | Conflicto; no se supone independencia |
| Legado sin oportunidad, grupo explícito y una ganada | Selección con identidad legacy visible |
| Renovaciones o compras independientes reutilizan el mismo grupo | Pendiente: requiere identidad explícita, no separación inventada |
| Vendedor con una propuesta propia y posibles versiones fuera de su alcance | Exportación propia sin selección certificada |

## Formato y compatibilidad

El sobre cambia a `cotiza-proposal-export/0.2`: cada registro agrega origen,
oportunidad y `sale_selection`; los enlaces agregan evidencia de relación y
conteo de ganadas. `selection` pasa a `unique_won_deal_or_unresolved`.
No interpretar la versión 0.2 como 0.1. Es un formato interno de preparación,
NO el commercial_snapshot universal ni una fuente aceptada por el ranking v0.1.
La procedencia continúa `not_attested`, integridad local y cobertura no certificada.

No se habilita endpoint, capacidad, caché, persistencia, migración ni escritura
de hechos. No hay credenciales ni consumo de IA. La revalidación del servidor
antes/después del SELECT del PR #31 sigue vigente. La consulta única ofrece
una lectura consistente de sus filas; no constituye un archivo histórico
versionado. El límite de 500 candidatos continúa detectando desbordamiento.

## Validación local

Desde cotiza-web, tras instalar dependencias existentes y generar Prisma:

```bash
PGLITE_MODULE=/ruta/externa/a/pglite/dist/index.js npm test -- lib/domain/commercial-sale-selection.test.ts lib/reports/commercial-proposal-export.test.ts lib/db/commercial-export-source.integration.test.ts
```

67 pruebas aprobadas: 24 de regla, 29 de servicio y 14 de SQL ejecutado en
PostgreSQL desechable/PGlite 0.3.14. Cubre pares fuera del periodo, peers de otro
tenant, otras oportunidades del mismo cliente, enlaces formales sin origin,
revisiones nuevas no ganadas, aislamiento del vendedor y contradicciones de
identidad. TypeScript y ESLint de los seis archivos de código pasaron.
No acredita Clerk real, CI remoto ni datos productivos.

Suite general según la exclusión existente en CI
(`--exclude validate-quote-lifecycle.e2e.test.ts`): 617 aprobadas y 59 omitidas,
con 60 archivos aprobados y 4 omitidos. La E2E heredada requiere DATABASE_URL;
no se ejecutó ni se proporcionaron credenciales productivas. `git diff --check`
sin errores. Las pruebas Python del PR #29 no cambian en este incremento.

La consulta recorre relaciones de ganadas del tenant para cada candidato;
antes de activar requiere EXPLAIN/índices y pruebas de volumen. El límite de
salida no acredita un límite de trabajo interno de PostgreSQL.

## Próximo paso

Conciliar esta selección con el diccionario/contrato de ranking usando datos
sintéticos, manteniendo los estados unresolved e incompletitud. Antes de
conectar datos reales: G0, revisión de la política de negocio, permisos finos,
atestación autenticada del origen y esquema universal versionado. Para habilitar
el ranking al vendedor será necesaria una proyección autorizada de selección
por el origen que preserve la confidencialidad; no se resolverá leyendo ventas
ajenas desde la conversación. No se agrega aún esa capacidad.
