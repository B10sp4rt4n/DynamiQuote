# Plan de cierre del MVP fiscal de Cotiza

Establecido el 9 de noviembre de 2026 (Ciudad de México), por instrucción de
Salvador. Base revisada: Cotiza `ddda1a5` y Digestor `e3aede1`.

## Orden y criterio de salida

| Orden | Pendiente | Criterio verificable | Estado |
| --- | --- | --- | --- |
| 1 | Preparar, guardar y reabrir prefactura | Recuperar datos y claves exactamente revisados; validar identidad, empresa, revisión y catálogo; conservar vista previa y bloquear información obsoleta. Probar persistencia y reapertura. | En curso |
| 2 | Prefactura → CFDI y recuperación | Un solo timbrado ante doble clic, concurrencia o respuesta perdida; recuperación de UUID/XML/PDF sin volver a emitir. | Pendiente de recorrido conectado actualizado |
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
- [ ] Registrar evidencia de pruebas y estado real del recorrido conectado.

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

Pendiente para cerrar el punto 1 en producción: publicar la entrega revisada y
verificar la preparación/reapertura conectada con una operación apropiada, sin
emitir CFDI. No se declara esta operación productiva realizada ni se cambia la
clasificación fiscal de una propuesta comercial durante estas pruebas.
