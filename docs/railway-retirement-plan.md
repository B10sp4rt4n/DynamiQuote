# Retirada controlada del Cotiza antiguo en Railway

**Estado:** procedimiento propuesto, **NO ejecutado**. Preparación de PR #28
en `fix/multitenant-foundation`; no autoriza detener servicios, migrar bases
de datos, emitir CFDI, cambiar DNS, borrar cuentas ni promover código.

## Decisión técnica

El portal productivo que utiliza la operación comercial es
`https://dynami-quote.vercel.app`, Vercel proyecto `dynami-quote`,
despliegue `dpl_GvKryAuSHx1QQe22MNAUymSiUKwG`,
Git `main/55760ab4` al efectuar la revisión. Railway hospeda otra
instancia **antigua** de Next.js con acceso configurado a la rama de Neon
**production** `br-quiet-morning-ahkomhhi`. El PR #28, todavía draft,
no está publicado en producción. No afirmar equivalencia de código
ni compatibilidad de revertir a la imagen antigua después de las migraciones.

Identificación inequívoca del servicio antiguo:

| Elemento | Identificador |
| --- | --- |
| Railway proyecto | `cotiza-web` / `1980096f-8e39-416b-8a12-45b5815af5a6` |
| Railway entorno | `production` / `79506dd6-a076-4104-911a-9167da50040d` |
| Railway servicio | `cotiza-web` / `7b8c668c-d093-42e0-a418-ce2ddc7c652d` |
| Railway despliegue | `1e21faa5-0be3-4ceb-9235-12eacd65c925` |
| Snapshot de artefacto | `d7b4ebc5-4a68-4e44-a85a-ddd1dc4a6f4d` |
| Dominio antiguo | `cotiza-web-production.up.railway.app` |
| Destino SQL | Neon proyecto `cool-resonance-22906937`, rama `br-quiet-morning-ahkomhhi`, base `neondb` |
| Método de publicación | CLI `railway up`; no hay repositorio Git ni commit completo verificable en Railway |

### Evidencia no destructiva, 23 de octubre de 2026

- Único servicio listado para el proyecto de Railway; despliegue `SUCCESS`,
  una réplica activa y sin cambios staged.
- Siete días de métricas HTTP: cero solicitudes registradas; logs HTTP/DNS/
  network-flow de la ventana consultada sin eventos.
- Consulta **SELECT** agregada a `pg_stat_activity` en Neon production,
  excluyendo la sesión de inspección: **cero client backends adicionales
  observados en ese instante**.
- Ninguno de estos tres puntos prueba ausencia de consumidores intermitentes,
  conexiones de pool cerradas, clientes por fuera del dominio, timers, colas,
  intentos de escritura ni transacciones entre muestras.
- Los archivos fuente parcialmente fingerprintados del runtime Railway no
  coinciden con el nuevo PR. Su antiguo `proxy.ts` carece de la pausa
  `CRM_MAINTENANCE_MODE`; pausar Vercel no detiene Railway.
- El inventario de usuarios heredados de prueba no justifica reactivar
  identidades antiguas. Sin embargo, Neon contiene documentos con evidencia
  de entrega y por lo menos una factura timbrada: **no borrar datos**.

## Condiciones obligatorias antes de detener Railway

- [ ] Confirmar que ninguno de los usuarios autorizados utiliza el dominio
  Railway ni enlaces de correo/invitaciones que lleguen ahí.
- [ ] Revisar webhooks, integraciones externas, automatizaciones, tareas de
  fondo y scripts con credenciales SQL directas. Los cero accesos HTTP no
  resuelven estas dependencias.
- [ ] Confirmar con el responsable del producto que Vercel es el único portal
  de acceso y que el servicio antiguo puede quedar suspendido.
- [ ] Guardar versión/artefacto/snapshot y verificar respaldo **recuperable**
  de Neon, preferentemente con restauración ensayada en rama aislada.
  Ninguna conexión a datos reales debe apuntarse a una base de prueba.
- [ ] Registrar ventana y aprobación específica para **detener la réplica**
  (no eliminar de entrada servicio, dominio, base, credenciales ni snapshot).
- [ ] Verificar que no haya transacciones en curso / consumidores adicionales
  antes de cambiar el estado de Railway.

## Secuencia aprobable en una ventana futura

1. Congelar escrituras y notificar a operadores del servicio antiguo.
   Preparar estado y hora de la instancia exacta arriba indicada.
2. Suspender **el proceso** de Railway con un mecanismo que deje 0
   réplicas o retire temporalmente el despliegue; no basta borrar el
   dominio ni cambiar variables de Vercel. Esta operación requiere
   autorización específica y supervisión.
3. Comprobar mediante Railway que no hay instancias y en Neon que no
   quedan sesiones de ese origen. Tomar mediciones repetidas durante
   la ventana; una sola lectura no es suficiente para probar drenado.
4. Confirmar el acceso normal en Vercel con identidad real, lectura de
   clientes, cotizaciones y propuestas, sin envíos de correo ni timbrado
   de factura de prueba contra proveedores reales.
5. **Antes de migraciones**, si aparece una dependencia legítima,
   revaluar la suspensión y restaurar exclusivamente bajo la
   configuración anterior y un análisis de compatibilidad.
6. Si el nuevo PR llega a aplicarse en Neon production, **prohibir**
   restaurar el runtime Railway antiguo: sus rutas pueden desconocer las
   nuevas restricciones, aunque Railway ofrezca `canRollback=true`.
   Usar recuperación de la versión compatible y plan de base aprobados.
7. Retirar definitivamente recursos/dominio/variables de Railway
   solamente con autorización separada, una vez observado el
   servicio Vercel y transcurrida la ventana de reversibilidad elegida.

## Condiciones de suspensión del corte

Cualquier consumidor no identificado, actividad de escritura inesperada,
error de autenticación, diferencia en destino Neon, respaldo no recuperable
o disconformidad del responsable operativo implica **no ejecutar** la
suspensión. La prioridad es preservar Cotiza productivo, los documentos
comerciales y la evidencia fiscal.

## Relación con PR #28

La retirada de Railway puede programarse de manera independiente a la
publicación del PR, pero el cambio de esquema multitenant requiere **además**
el orden, preflight, datos históricos protegidos y controles en
`docs/crm-cutover-runbook.md`. No fusionar usuarios por alias o nombre ni
vincular datos históricos declarados pruebas. El CRM sigue desconectado.

Referencia de pruebas del candidato de software:
https://github.com/B10sp4rt4n/DynamiQuote/actions/runs/39959563245
