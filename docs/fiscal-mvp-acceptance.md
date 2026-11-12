# Matriz de aceptación del MVP fiscal de Cotiza

Actualización: 11 de noviembre de 2026. La aceptación controlada de recuperación REP se detalla en [rep-recovery-acceptance.md](rep-recovery-acceptance.md); la evidencia de esta revisión se registra en su PR. Las referencias siguientes conservan su procedencia histórica. Fecha base: 10 de noviembre de 2026. Base de Cotiza: `ae9c960b76a137332ed19aa5be9fd731a2693b85` (PR89); Digestor publicado: `631244c5d66abce83fa93f1676325cc4f19a2910` (PR20). Las correcciones de seguimiento descritas al final están preparadas en esta rama; su publicación se informa por separado.

El perfil de salida es factura nacional MXN con IVA16, PUE o PPD/99, pagos y REP del mismo perfil. No incluye todas las modalidades de CFDI. Código aprobado, prueba aislada, prueba del PAC sandbox y operación productiva son evidencias diferentes.

## Recorrido y aceptación

| Caso | Resultado exigido | Evidencia o control | Estado de cierre |
| --- | --- | --- | --- |
| Prefactura | Guardar y reabrir exactamente los datos y claves revisados; bloquear cambios de versión o catálogo | PR72/73; `invoice-preparations.integration.test.ts`, `proposal-invoices.integration.test.ts`, pruebas de clasificación; reapertura publicada registrada en el plan anterior | Recorrido publicado y verificado; mantener regresión |
| PUE MXN/IVA16 | XML/PDF corresponden al mismo UUID y a la revisión confirmada | `invoice/route.test.ts`, `invoice/stamp/route.test.ts`, `invoice/xml/route.test.ts`, `test_fiscal_rules.py`; piloto sandbox PROP-2026-0294 | Demostrado en sandbox; no usarlo como prueba productiva independiente |
| Emisión incierta de factura | Reservar antes del PAC; nunca volver a emitir automáticamente; recuperar mismo UUID/XML | `invoice-stamp.test.ts`, `invoice/reconcile/route.test.ts`, `invoice-recovery.integration.test.ts`, `test_invoice_recovery.py`; evidencia pública sandbox de PR15 | Implementado y publicado; recuperación comprobada en pruebas, no incidente productivo real |
| Factura y cancelación reales | Conservar XML y acuse; distinguir solicitud de cancelación confirmada | PROP-2026-0299, total1.16, UUID a1974ca9-3fab-4911-95d4-551533546034; última consulta SAT documentada Cancelado | Recorrido productivo comprobado; sin pago ni REP |
| PPD/99 y pago total | Un pago, un REP, relación con factura, IVA, total y saldo0 | PROP-2026-0297,116; `test_payment_cycle.py`, `test_ppd_production.py`, `fiscal-cycle.integration.test.ts` | Comprobado en sandbox y pruebas aisladas; REP productivo abierto |
| Dos parcialidades | Secuencias1/2, saldos116→76→0, base100+IVA16; no duplicar pagos | PROP-2026-0298, pagos40 y76; XML cotejados | Recorrido sandbox comprobado; su sustitución sigue abierta |
| Respuesta perdida del REP | Una emisión; bloqueo de repetición y recuperación por UUID confirmado; saldo intacto | `rep-recovery.integration.test.ts`, `proposal-payment-panel.test.tsx`, PostgreSQL de ambos sistemas y fixture sin PAC; ensayo público histórico del9nov | Aceptación controlada conectada comprobada; falta caso PPD/REP productivo |
| REP todavía en proceso | Bloquear reemisión y recuperación mientras el trabajador está activo; consultar antes de continuar | Regresión de UI processing/unknown y concurrencia HTTP/PostgreSQL | Ajuste de pantalla preparado; bloqueo backend ya existente |
| Cancelación de REP | Acuse no equivale a cancelación; cancelar XML no borra pago | `test_billing_cancellations.py`, `test_fiscal_production_operations.py`, `proposal-cancellations.test.ts` | Controles probados; validación productiva con operación real pendiente |
| Sustitución de factura | Relación04, mismos importes/RFC; seleccionar sustituta sólo después de cancelar anterior | `test_fiscal_revisions.py`, `fiscal-correction.integration.test.ts`, `proposal-correction-panel.test.tsx` | Pruebas controladas; no declarar recorrido productivo completo |
| Sustitución de REP | Corregir forma/referencia sin cambiar pago, secuencia, saldo o XML original | Mismas suites; sustituto ec235394-e017-4169-be60-ee3445fbea71 en PROP-2026-0298 | Emisión sandbox demostrada; cancelación del anterior pendiente del PAC QA |
| Emisión antigua de sustituta sin UUID | Recuperar el resultado exacto; no inventar rechazo ni ausencia de emisión | Revisión609bd2e0-6dde-4818-bdb3-b57195e36408, IdComprobante `revision-609bd2e0-6dde-4818-bdb3-b57195e36408`; base SQLite desechable sin proposal_id | Bloqueo externo documentado; no resuelto ni descartado |
| Visibilidad del expediente | Quitar Ganada no oculta XML, REP, acuse ni historial; no cambia KPIs indebidamente | PR85/86; `proposal-fiscal-history.test.tsx`, `proposal-cancelled-invoice.test.tsx` | Publicado y verificado en PROP-2026-0299 |
| Consulta SAT manual | Consultar documento de la empresa actual; conservar respuesta/fecha/fuente; un fallo no borra última respuesta | PR20 Digestor/PR89 Cotiza; `proposal-sat-status.test.tsx`; PROP-2026-0299 confirmado Cancelado | Publicado; no es seguimiento periódico ni descarga masiva |
| Aislamiento y concurrencia | Documento/tenant/rol/origen ajenos rechazados; una reserva por emisión; PostgreSQL concurrente | Pruebas de rutas y `test_fiscal_production_operations.py`; pruebas PostgreSQL en CI de PR20/89 | Evidencia histórica CI; casos PostgreSQL omitidos en corrida local SQLite no se cuentan como aprobados |
| Saldo económico frente a REP | Saldo0 no se presenta como expediente completo si falta emisión, recuperación o revisión de REP | Nueva regresión de panel y `check_payment_follow_up_ui.mjs` | Corregido en esta rama; publicación pendiente |
| Cancelación recién leída | Bloquear el REP siguiente aun con `fiscal_ready:true` anterior; no emitir para probar | Nuevas regresiones con requested/processing/unknown/cancelled; navegador sintético sin POST | Corregido en esta rama; publicación pendiente |

Los nombres cortos de pruebas frontend corresponden a `cotiza-web/`; los de Python a `tests/` en Digestor. La prueba de concurrencia PostgreSQL no queda sustituida por SQLite. Las referencias a producción corresponden a evidencia conservada del recorrido anterior; esta revisión no emite ni cancela documentos.

## Límites del perfil

| Escenario | Comportamiento actual | Decisión para este MVP |
| --- | --- | --- |
| USD y tipo de cambio | La interfaz deshabilita preparación; API no convierte la propuesta ni la etiqueta MXN; Digestor devuelve unsupported_currency | Bloqueado explícitamente; no agregar conversión automática |
| IVA distinto de16, exentos u otros impuestos | Perfil fiscal de Digestor rechaza combinaciones no soportadas | Bloqueado; no sustituir una tasa diferente por16 para emitir |
| Nota de crédito/CFDI de egreso | No existe recorrido implementado de creación, relación y conciliación de egresos | Fuera del perfil; no presentar sustitución o cancelación como nota de crédito |
| Cambiar RFC, cantidad, precio o moneda en sustitución | Los cambios admitidos son una lista cerrada; importes/RFC quedan protegidos | Requiere otro escenario diseñado, no ampliar esa lista para saltar el bloqueo |
| Factura con pagos ya registrados | Corrección de factura bloqueada; cancelación directa bloqueada por pagos; no borrar cobros para continuar | Revisión de documentos y REP; sin cancelación económica automática |
| REP de una parcialidad anterior | Corrección limitada al último complemento; cancelaciones se resuelven en orden inverso cuando corresponde | Mantener control de secuencia y pagos |
| Pérdida de respuesta antes de conocer UUID | Consulta al proveedor con referencia exacta; no reemitir, descartar ni liberar por tiempo | Bloqueo hasta evidencia concluyente |
| Seguimiento periódico SAT, descarga emitidos/recibidos y CIMA | Consulta manual y periódica publicadas/verificadas (PR96/21); e.firma/descarga y contrato CIMA pendientes | El seguimiento no cierra REP productivo ni resuelve incidentes del PAC |

Controles de moneda e impuestos: `invoice/route.test.ts`, `proposal-invoice.test.ts` y `test_fiscal_rules.py`. Corrección/cancelación con pagos: `test_fiscal_revisions.py`, `test_billing_cancellations.py`. No se compró servicio ni se consumieron timbres en esta entrega.

## Correcciones de esta entrega

El panel resume por separado el pago total/parcial registrado y los pagos cuyo complemento requiere emisión, recuperación o revisión. El texto no afirma vigencia SAT ni cierre fiscal por saldo0. Los documentos cancelados siguen mostrando su historial, sin el mensaje de pago liquidado como cierre de expediente.

Una lectura de cancelación que bloquea invalida inmediatamente la aptitud fiscal local de ese REP. El REP siguiente exige tanto estado timbrado como aptitud fiscal; un indicador anterior no puede prevalecer sobre una cancelación recién leída. Una sustitución ya confirmada conserva la aptitud de su documento efectivo aunque el original histórico esté cancelado; esto tiene regresión propia.

## Condición de salida y trabajo que sí puede continuar

El cierre técnico exige regresiones y recorrido de pantalla aprobados, límites explícitos, casos desconocidos sin repetición y documentación coherente con lo publicado. Esta matriz consolida esos criterios; no equivale a certificar el MVP completo.

Pendientes externos concretos: localizar el resultado antiguo mediante el PAC QA; confirmar la cancelación anterior de PROP-2026-0298; y probar REP/corrección/cancelación productivos con una operación y pago efectivamente recibidos. No crear otro cobro ficticio para aprobarlos.

Evidencia de los incidentes y última consulta: [revisión del10nov](https://chatgpt.com/library?file_id=libfile_0e5014b36c48819191324090bd701c14&account_id=personal). Plan general vigente: [Cotiza/SAT/CIMA](https://chatgpt.com/library?file_id=libfile_b65d573b252081919094bcdb3e9ed25e&account_id=personal).
