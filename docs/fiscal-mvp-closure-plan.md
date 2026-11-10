# Plan de cierre del MVP fiscal de Cotiza

Estado consolidado al10nov2026: consultar [la matriz de aceptación actual](fiscal-mvp-acceptance.md). Las secciones inferiores conservan evidencia y pendientes tal como se registraron en cada entrega; no deben interpretarse como una lista vigente de cambios aún sin publicar. La matriz distingue pruebas, sandbox, producción y bloqueos externos.

Establecido el 9 de noviembre de 2026 (Ciudad de México), por instrucción de
Salvador. Base revisada: Cotiza `ddda1a5` y Digestor `e3aede1`.

## Orden y criterio de salida

| Orden | Pendiente | Criterio verificable | Estado |
| --- | --- | --- | --- |
| 1 | Preparar, guardar y reabrir prefactura | Recuperar datos y claves exactamente revisados; validar identidad, empresa, revisión y catálogo; conservar vista previa y bloquear información obsoleta. Probar persistencia y reapertura. | Publicado y verificado en producción |
| 2 | Prefactura → CFDI y recuperación | Un solo timbrado ante doble clic, concurrencia o respuesta perdida; recuperación de UUID/XML/PDF sin volver a emitir. | Implementado y probado con HTTP/SQL, PostgreSQL real, navegador y PAC público sandbox; publicación pendiente |
| 3 | Pagos PPD → REP → saldo | Varias parcialidades, recuperación y saldo comprobables; cobros económicos separados del estado fiscal. | Publicado; falta acreditar recorrido completo conectado |
| 4 | Cancelación, sustitución y corrección | Acuse separado de confirmación SAT; UUID/revisión exactos; motivo 01 y corrección REP conservando documentos y pagos. | Una cancelación real acreditada; otros perfiles pendientes |
| 5 | Alcance fiscal restante | Matriz de USD/tipo de cambio, notas de crédito y facturas con pagos: soporte demostrado o bloqueo explícito; evidencia y siguiente acción. | Pendiente de consolidación |

69-B y nuevas capacidades se incorporan después de consolidar este recorrido.
Los perfiles ampliados no impiden liberar un perfil nacional MXN/IVA16 cuyo
recorrido y límites estén comprobados.

## Reglas de ejecución

- Distinguir código implementado, pruebas sintéticas, integración real, sandbox
  PAC y operación real autorizada. Un despliegue READY no acredita el ciclo.
- Desarrollar y probar con datos sintéticos y recursos desechables. No esperar
  casos comerciales para avanzar en escenarios reproducibles.
- No emitir/cancelar CFDI, registrar cobros reales ni enviar comunicaciones como
  parte de una comprobación técnica. La revisión de una prefactura no autoriza
  su timbrado.
- No agregar servicios de IA ni suscripciones nuevas. Usar infraestructura actual.
- Conservar aislamiento de tenant, visibilidad, confirmación y evidencia histórica.
- Cada entrega registra evidencia, límites y siguiente acción; publicar cambios
  productivos se trata por separado de preparar una rama revisable.

## Pendiente 1: diagnóstico y ejecución

La inspección en producción de PROP-2026-0286 mostró un evento de clasificación
en el historial y cero partidas confirmadas en el panel reabierto. El código
confirma que GET invoice sólo devuelve la base de partidas y la UI reinicia las
claves vacías. La memoria comercial es candidata y exige una nueva confirmación;
no es un mecanismo para recuperar la preparación exacta del mismo documento.

Acciones:

- [x] Revisar código publicado y pantalla actual en lectura.
- [x] Recuperar preparación del documento, diferenciada de memoria comercial.
- [x] Verificar actor/tenant/propuesta/revisión y catálogo antes de reutilizarla.
- [x] Probar reapertura, edición, catálogo cambiado, errores e identidades ajenas.
- [x] Registrar evidencia de pruebas y estado real del recorrido conectado.

Evidencia de partida: PR Cotiza #69/#71 y Digestor #14. La inspección realizada
en esta entrega fue de lectura; no se confirmó clasificación ni se regeneró el
documento productivo.

### Entrega del primer pendiente

Implementado en la rama `fix/fiscal-classification-resume`:

- Snapshot transaccional de la preparación y recuperación exacta del receptor,
  método/forma de pago y recibos de clasificación del borrador.
- Recuperación de confirmación para el mismo actor/documento/revisión; memoria
  comercial separada. Revalidación de catálogo y resguardo contra respuestas tardías.
- Documento, emisor, actor, recibos o catálogo cambiados mantienen bloqueado el
  timbrado hasta revisar/regenerar. Los borradores antiguos no se reconstruyen
  sin evidencia: conservan vista previa y requieren regeneración.

Evidencia local inicial: 916 pruebas aprobadas, 65 omitidas (incluidas las cinco
nuevas de base desechable en la ejecución ordinaria); estas cinco se ejecutaron
por separado con Prisma y PostgreSQL/PGlite de loopback y aprobaron. Comprueban
lectura desde otra conexión, aislamiento, catálogo/recibos alterados, concurrencia
y rollback. El catálogo y proveedor fiscal permanecen simulados. La suite final
de GitHub registra el conteo posterior a los casos adicionales.

La revisión de navegador local no pudo arrancar Chromium por `socket() failed:
Operation not permitted`. Se mantiene la prueba de navegador reproducible en
GitHub Actions para escritorio/móvil; las pruebas React/JSDOM sí se ejecutaron.
El workflow añade una base PostgreSQL 18 desechable para verificar persistencia
sin credenciales ni conexiones productivas.

Estado histórico al preparar el PR #72 — pendiente para cerrar el punto 1 en producción: publicar la entrega revisada y
verificar la preparación/reapertura conectada con una operación apropiada, sin
emitir CFDI. No se declara esta operación productiva realizada ni se cambia la
clasificación fiscal de una propuesta comercial durante estas pruebas.

### Verificación final de esta entrega

- PR de implementación y plan: https://github.com/B10sp4rt4n/DynamiQuote/pull/72.
- Código verificado: `25d11bdfc098966b6e4b8f1704a9f8d4cff46a77`.
- GitHub Actions: https://github.com/B10sp4rt4n/DynamiQuote/actions/runs/42595063627.
- Regresión: 919 aprobadas, 65 omitidas; TypeScript aprobado.
- Persistencia: cinco pruebas aprobadas con PostgreSQL 18.6 real desechable.
- Navegador sintético: escritorio 1360 px y móvil 390 px aprobados, con recarga
  completa, una creación de borrador y cero llamadas de timbrado. Sin peticiones
  externas, errores de consola ni desbordamiento. Las capturas de reapertura de
  ambos tamaños fueron inspeccionadas.
- Artefacto GitHub `fiscal-classification-visual`, ID 13663416031: 14 capturas y
  result.json; retención hasta 12-nov-2026 09:40 UTC.
- Compilación Next.js local con webpack aprobada. El intento Turbopack se detuvo
  por el enlace de dependencias fuera del directorio del worktree; no se declara
  aprobado ese intento.

Estado histórico del PR #72: corrección preparada y comprobada en entornos sintéticos/aislados. El
punto 1 permanece abierto únicamente para su publicación y comprobación conectada
en producción. No se ha emitido ningún CFDI durante esta entrega.


### Cierre conectado del pendiente 1

Publicados los PR #72 y #73. El segundo corrige el contrato HTTP estricto del
validador SAT: sólo transmite los tres campos fiscales, separando metadatos de
confirmación. Producción verificada en commit
`8882ca1dee1a2505f3b006f9ce5cf5fe7c915e0f`, deployment Vercel
`dpl_3JN4Xht3mxNRS63aRw3kwLTgZmtb` READY. La preparación guardada fue regenerada
y reabierta en el mismo documento: receptor, PUE/03 y dos clasificaciones
confirmadas recuperadas, con vista previa. No se timbró. Esta verificación
posterior cierra el pendiente productivo anotado arriba.

## Pendiente 2: timbrado y recuperación

Implementado para revisión en `fix/fiscal-stamp-recovery`, con dependencia de
Digestor PR #15 (`3cd099862fa23d62258318b965d5ed2a35f83758`).

- Confirmación explícita ligada al borrador revisado, reserva atómica y defensa
  de doble clic en el panel. Una pestaña con otro draftId no puede emitir.
- Consulta persistida sin emisión; `not_sent` no libera una reserva local porque
  la consulta puede adelantarse al envío original. Sólo rechazo explícito sin
  evidencia contradictoria permite corregir.
- Recuperación por UUID confirmado con `ObtieneCFDI`. Exige solicitud original
  verificable y estructura comercial idéntica; conserva bloqueo en caso de
  diferencias, indisponibilidad o evidencia histórica insuficiente.
- XML descargable original, bajo aislamiento/visibilidad de propuesta. XML y
  PDF requieren coincidencia del timbre/UUID; no se certifican sellos ni estado SAT.
- UUID ya asociado a otro borrador rechazado y recuperación serializada en
  PostgreSQL. Folio automático estable por borrador si no se aporta uno.

Recorrido local conectado aprobado con rutas reales de Cotiza, Prisma sobre
PostgreSQL/PGlite desechable, adaptador HTTP real y FastAPI/SQLAlchemy/SQLite en
Digestor; únicamente identidad y PAC son sintéticos. Comprueba concurrencia,
respuesta perdida después de aceptación, UUID ajeno, recuperación idempotente,
XML exacto, PDF, rechazo y carrera de consulta anterior al envío. La CI añade
PostgreSQL 18 real para Cotiza y PostgreSQL 17 para concurrencia en Digestor.

Las pruebas sintéticas no acreditan PAC sandbox ni operación fiscal real.
La comprobación pública sandbox posterior se documenta abajo. Para publicar,
revisar el transporte activo y desplegar Digestor antes de Cotiza. Un estado
`processing` que sobreviva a la caída de un worker requiere revisión manual;
no se libera automáticamente por tiempo. Históricos sin huella tampoco se
recuperan por este mecanismo. La consulta estructural no verifica sellos ni
custodia externa. El siguiente pendiente funcional sigue siendo PPD/REP/saldo.


### Verificación conectada del pendiente 2

- Cotiza PR #74: https://github.com/B10sp4rt4n/DynamiQuote/pull/74.
- Fuente funcional verificada: `53caee57a2d7b50dcac17ee5d8081ba02d492d2c`.
- CI: https://github.com/B10sp4rt4n/DynamiQuote/actions/runs/42607390272:
  TypeScript y 958 pruebas aprobadas/67 omitidas; 17 pruebas de persistencia/
  concurrencia aprobadas en PostgreSQL 18.6 real y un recorrido conectado
  HTTP/SQL adicional aprobado (18 en total). Las omisiones de la suite corriente
  incluyen los casos que se ejecutan por separado y otros escenarios opcionales.
- Visual: escritorio 1360 px y móvil 390 px; respuesta desconocida, error de
  consulta, recuperación y recarga conservando estado. Cero emisiones, errores
  de consola, peticiones externas o desbordamiento en este ensayo visual.
  Capturas inspeccionadas. Artefacto `fiscal-classification-visual`, ID13669255552,
  sha256 `aa1e13ff5ac39c3fd3039e1a789e7c4833732e86197016ae76ddca85e7595779`,
  vence 12-nov-2026 11:15 UTC.
- Digestor PR #15: https://github.com/B10sp4rt4n/digestor__fiscal/pull/15.
  CI https://github.com/B10sp4rt4n/digestor__fiscal/actions/runs/42606653428:
  308 pruebas y 54 subpruebas aprobadas, con concurrencia PostgreSQL 17.
- PAC real de pruebas: una emisión de demostración HTTP200, pérdida local
  deliberada de respuesta que persistió `unknown`, una consulta `ObtieneCFDI`
  HTTP200 y recuperación idempotente, con coincidencia de la estructura original
  y una sola métrica fiscal. No hubo emisión, cobro ni cancelación productivos.
  Evidencia y script reproducible en el PR #15, carpeta
  `docs/evidence/invoice-recovery-20261109/`.

Estado: pendiente 2 preparado y verificado para revisión/publicación, con el
límite explícito de que la aceptación sandbox corresponde al transporte REST
público; no se ejercitó el transporte SOAP de la instalación productiva ni se
certificaron sellos. No declarar desplegado este cambio. Después de publicarlo,
el siguiente pendiente es el recorrido PPD → REP → saldo.
