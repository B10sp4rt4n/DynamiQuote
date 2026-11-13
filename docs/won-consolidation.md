# Consolidación de ganada por empresa

La aceptación del cliente abre un circuito con la versión exacta de la propuesta
y la política vigente de su empresa. Mientras falte un OK, `proposals.outcome`
permanece vacío: no suma revenue ganado ni habilita preparar una factura nueva.
Los cierres históricos permanecen como están, sin reclasificación ni backfill.

## Uso

- Configuración → Reglas de ganada: owner/superadmin configura hasta 20 requisitos.
- Cada requisito define responsables por rol o persona, evidencia, separación del
  vendedor, dependencias y excepciones permitidas. Cualquiera de los responsables
  asignados puede dar ese OK; para exigir dos personas se crean dos requisitos.
- El umbral opcional usa el importe antes de IVA del nodo integrado. No se
  convierten monedas. La ausencia de importe o una moneda diferente bloquea la
  aceptación y solicita revisar la política, sin omitir el requisito.
- Propuesta → Consolidación de ganada: registrar fecha real y referencia de la
  aceptación. Sin requisitos aplicables consolida inmediatamente.
- Menú → Autorizaciones: cada responsable consulta los circuitos que puede
  revisar. La ruta específica no concede acceso de edición al resto del CRM.
- La campana muestra las solicitudes de aprobación interna que esperan al owner
  y los requisitos de consolidación que cada responsable ya puede atender. Las
  dependencias pendientes, respuestas registradas y circuitos retirados o con
  documento modificado no generan solicitudes accionables. Cada propuesta ocupa
  un aviso, aunque tenga varios requisitos para la misma persona.
- La campana consulta al entrar, cada minuto con la página visible, al recuperar
  foco y después de una aceptación o decisión. La fuente son los pendientes
  persistidos: también aparecen los anteriores, sin fabricar nuevas solicitudes
  ni aprobar en nombre de nadie. Los errores de consulta quedan visibles.
- `reviewNoticeUserIds` permite designar owners específicos para recibir avisos
  de revisión interna; sin selección aplica a los owners de la empresa. Los
  responsables de cada requisito reciben los avisos de consolidación.
- Con requisitos, cada OK queda registrado con actor, rol, hora y evidencia.
  Observar/rechazar bloquea la consolidación sin marcar perdida la operación.
  Cambiar una decisión invalida los OK dependientes, de forma transitiva.
- El vendedor o un administrador consolida explícitamente cuando todos están OK.
  Se conservan aceptación y momento de consolidación por separado. En el circuito
  mínimo, el KPI usa la fecha de aceptación; en el circuito con autorizaciones,
  usa el día de consolidación en Ciudad de México. Se mantiene la corrección
  explícita de fechas existente, con su auditoría.

## Versiones y límites de acceso

Los circuitos abiertos conservan la política aplicada aunque cambie la política
para aceptaciones futuras. Retirar una aceptación permite iniciar otro circuito;
no elimina su historial. Cambiar partidas, moneda, condiciones o documentos
invalida su huella. El flujo normal de edición/reapertura retira el circuito;
otros cambios se detectan por huella antes de autorizar o consolidar. Un documento
consolidado debe retirar primero su resultado antes de editar contenido por el
flujo normal. La transacción verifica identidad y rol activos en la base.
Las personas específicas deben pertenecer a la misma empresa. Superadmin no
omite automáticamente requisitos ni separación del vendedor.

Las rutas nuevas requieren sesión Clerk. Mutaciones verifican origen y empresa
capturada en la pantalla. Revisión optimista y bloqueos serializan política,
decisiones y cierre. El endpoint anterior no puede marcar ganada cuando una
política o circuito abierto exige consolidación. Los cambios y su auditoría se
confirman en la misma transacción. Un error de respuesta obliga a recargar antes
de otra mutación; no se reenvía automáticamente.

Esta entrega prepara la condición comercial para compras y notifica dentro de
Cotiza. No genera, envía ni libera requisiciones, órdenes al proveedor, correos,
pagos o timbrados. Esas
acciones requieren un flujo posterior que consuma el cierre consolidado.
Las validaciones de finanzas, existencias o contrato se registran manualmente
con evidencia; todavía no consultan sistemas externos de inventario o bancos.

## Publicación y verificación

1. Probar `cotiza-web/prisma/manual/20261113_won_consolidation.sql` en una copia
   de la base objetivo. Es aditiva, idempotente y no modifica resultados previos.
2. Aplicar ese SQL antes del código. No usar `prisma db push` en producción.
3. Publicar el código y revisar el circuito con registros de prueba.
4. Cada empresa configura su política; no se impone una regla financiera nueva
   a SynAppsSys ni a los demás tenants.

No se requiere contratar servicios, agregar dependencias productivas o IA.
La liberación debe registrar por separado migración, configuración y despliegue;
un build aprobado no demuestra una notificación recibida por una persona.

Pruebas: suite general, TypeScript, lint, build Next.js; integración en PostgreSQL
local desechable con `COTIZA_WIN_TEST_DATABASE_URL` apuntando exactamente a
`127.0.0.1/cotiza_win_synthetic`. Esa suite crea el esquema desde cero, aplica el
SQL dos veces y prueba aislamiento, política mínima, rechazos, dependencias,
huellas, bloqueo de bypass, decisiones simultáneas y cierre único. El recorrido
`scripts/check_win_consolidation_ui.mjs` usa componentes reales y respuestas HTTP
sintéticas a 1360/390 px. El workflow `won-consolidation.yml` reproduce los checks
sin datos reales ni credenciales fiscales.
