# Iniciativas de Liberacion y Evaluacion por Tenant

## 1) Proposito
Definir un marco funcional y operativo para:
- Liberar propuestas comerciales con control de rentabilidad.
- Evaluar desempeno comercial por tenant y por usuario vendedor.
- Mantener gobernanza de aprobaciones con visibilidad para Owner y Superadmin.

## 2) Objetivos de negocio
1. Acelerar salida comercial cuando una propuesta es sana en margen.
2. Bloquear riesgos cuando el margen esta fuera de politica.
3. Estandarizar aprobaciones minimas por rol.
4. Medir calidad comercial por vendedor y de forma global.
5. Separar claramente informacion interna vs informacion para cliente.

## 3) Alcance funcional
Este alcance cubre tres capas:
1. Capa de liberacion de propuesta (reglas de margen y aprobacion).
2. Capa de evaluacion y analitica por tenant (KPIs y semaforizacion interna).
3. Capa de visibilidad ejecutiva (resumen por usuario y resumen general para Owner/Superadmin).

## 4) Iniciativas de liberacion (motor de decisiones)

### 4.1 Primer liberador: rangos permitidos de margen
Cada tenant define politicas de margen:
- Margen minimo permitido.
- Margen maximo permitido.
- Umbral alto para preaprobacion informativa.

Regla base:
- En rango: puede avanzar por flujo estandar.
- Fuera de rango: no se emite automaticamente; pasa a flujo de excepcion.

### 4.2 Preaprobacion informativa por rentabilidad alta
Cuando una propuesta supera el umbral alto definido por tenant:
- Se habilita estado **Preaprobada Informativa**.
- Se permite compartir al cliente en modo informativo.
- No equivale a autorizacion final ni a emision final.

Leyenda obligatoria en salida informativa:
"Documento informativo preaprobado por politica de rentabilidad. Sujeto a autorizacion comercial final."

### 4.3 Autorizacion formal obligatoria
Para pasar a estado **Autorizada**:
- Owner es obligatorio en todos los tenants.
- Superadmin observador puede ser obligatorio segun politica del tenant.

### 4.4 Excepcion por fuera de rango
Si una propuesta nace fuera de rango:
- Se bloquea liberacion directa.
- Requiere aprobacion excepcional de Admin y/o Owner segun politica del tenant.
- Owner se mantiene como requisito minimo para autorizacion final.

### 4.5 Revalidacion por cambio
Si cambia precio, costo o margen despues de una aprobacion:
- Se invalidan aprobaciones previas.
- La propuesta vuelve a evaluacion.

## 5) Estados del flujo propuesto
1. Borrador
2. Pendiente validacion de margen
3. Preaprobada informativa
4. Pendiente aprobacion formal
5. Autorizada
6. Emitida final
7. Rechazada

## 6) Iniciativas de evaluacion por tenant

### 6.1 Semaforizacion interna (solo sistema)
- Verde: en rango y con avance saludable.
- Amarillo: atencion (pendiente aprobacion o cerca de umbral).
- Rojo: fuera de rango, bloqueada o riesgo alto.
- Gris: sin evaluacion completa.

Regla critica:
Estos colores son **solo internos**. No deben aparecer en propuesta, PDF, XLSX ni correo al cliente.

### 6.2 KPIs por vendedor (tenant-scoped)
1. Volumen de propuestas creadas.
2. Porcentaje en verde.
3. Porcentaje en rojo.
4. Tiempo promedio de autorizacion.
5. Tasa de aprobacion en primera vuelta.
6. Tasa preaprobada informativa -> emitida final.
7. Monto emitido total.
8. Margen promedio emitido.
9. Reproceso por invalidacion de aprobaciones.

### 6.3 KPIs globales del tenant
1. Pipeline total por estado.
2. Conversion global a emitida final.
3. Cuellos de botella por etapa.
4. Tiempo medio de ciclo completo.
5. Distribucion de riesgo (verde/amarillo/rojo/gris).

## 7) Visibilidad para Owner y Superadmin

### 7.1 Resumen por usuario vendedor
Owner y Superadmin deben ver, por vendedor:
- Total propuestas.
- Monto pipeline.
- Margen promedio.
- Distribucion semaforo.
- Conversion a emitida final.
- Tiempo promedio de autorizacion.
- Pendientes criticos (sin aprobar, fuera de rango, re-trabajo).

### 7.2 Resumen de desempeno general
Owner y Superadmin deben ver un resumen ejecutivo de tenant:
- KPIs globales del periodo.
- Tendencia semanal/mensual.
- Ranking de vendedores (calidad y conversion).
- Alertas de riesgo operativo y comercial.
- Comparativa contra periodo anterior.

### 7.3 Niveles de acceso
- Owner: acceso total al tenant, detalle por vendedor y vista ejecutiva.
- Superadmin: acceso total multi-tenant o tenant-segun-alcance, con comparativos.
- Admin: gestion operativa, visibilidad segun politica interna.
- Vendedor: solo sus propuestas y sus metricas personales.

## 8) Canales de notificacion
1. Email obligatorio para requerimientos de aprobacion.
2. Slack opcional si tenant tiene integracion activa.
3. Notificaciones incluyen:
- Propuesta afectada.
- Motivo (fuera de rango, pendiente owner, etc).
- SLA sugerido de atencion.

## 9) Reglas de salida al cliente
1. Propuesta informativa permitida solo en estado preaprobada informativa.
2. Propuesta final al cliente solo cuando este autorizada segun reglas activas.
3. Nunca incluir semaforos internos ni etiquetas de riesgo en salidas externas.

## 10) Criterios de aceptacion
1. En rango:
- Dado margen en rango, cuando se valida, entonces avanza sin bloqueo por riesgo.

2. Fuera de rango:
- Dado margen fuera de rango, cuando se intenta emitir, entonces se bloquea y solicita excepcion.

3. Owner obligatorio:
- Dado propuesta pendiente, cuando no existe aprobacion Owner, entonces no puede quedar Autorizada.

4. Regla observador:
- Dado tenant con observador obligatorio, cuando solo aprueba Owner, entonces no pasa a Autorizada.

5. Preaprobacion informativa:
- Dado margen superior al umbral alto, cuando se comparte al cliente, entonces se envia en modo informativo con leyenda.

6. Dashboard ejecutivo:
- Dado Owner o Superadmin, cuando entra al panel de desempeno, entonces ve resumen por usuario y resumen general.

7. Separacion interna/externa:
- Dado cualquier documento para cliente, cuando se genera salida, entonces no contiene codigos de color internos.

## 11) Roadmap sugerido

### Fase 1 - Fundacion de reglas
- Configuracion de rangos por tenant.
- Evaluador de margen.
- Estados base y bloqueo fuera de rango.

### Fase 2 - Aprobaciones y notificaciones
- Flujo Owner obligatorio.
- Regla observador configurable.
- Email y Slack.

### Fase 3 - Preaprobacion informativa
- Umbral alto por tenant.
- Salida informativa con leyenda.

### Fase 4 - Analitica y control ejecutivo
- KPIs por vendedor.
- Dashboard general de tenant.
- Vistas Owner y Superadmin.

## 12) Riesgos y mitigaciones
1. Ambiguedad de reglas por tenant:
- Mitigar con plantillas de politica y validadores de configuracion.

2. Exposicion accidental de semaforos al cliente:
- Mitigar con capa separada de render externo y pruebas de regresion.

3. Cuellos de aprobacion:
- Mitigar con SLA, recordatorios y escalamiento.

4. Rechazo de adopcion por complejidad:
- Mitigar con UX guiada y panel claro por rol.

## 13) Definiciones operativas
- Liberacion: habilitacion para avanzar en flujo comercial.
- Autorizacion: aprobacion formal interna requerida por politica.
- Emision final: entrega formal definitiva al cliente.
- Preaprobada informativa: salida rapida no final, sujeta a autorizacion.

## 14) Resultado esperado
- Mayor velocidad comercial en propuestas sanas.
- Menor riesgo en propuestas de baja rentabilidad.
- Gobierno claro de aprobaciones.
- Visibilidad ejecutiva por vendedor y global para Owner y Superadmin.

## 15) Backlog ejecutable (epicas e historias)

### Epic A - Politica de margen por tenant
Objetivo: habilitar reglas de liberacion por rangos configurables por tenant.

Historias:
1. Como Owner quiero definir margen minimo/margen maximo por tenant para controlar liberacion.
2. Como Owner quiero definir umbral alto de preaprobacion informativa para acelerar propuestas saludables.
3. Como sistema quiero validar tenantId en todas las consultas de politica para evitar cruce de datos.

### Epic B - Motor de decision de liberacion
Objetivo: decidir automaticamente estado y ruta de aprobacion segun margen.

Historias:
1. Como vendedor quiero que el sistema clasifique la propuesta en rango/fuera de rango al guardar cambios.
2. Como sistema quiero bloquear emision automatica de propuestas fuera de rango.
3. Como sistema quiero invalidar aprobaciones previas si cambia costo/precio/margen.

### Epic C - Aprobaciones formales
Objetivo: asegurar autorizacion minima con Owner y reglas adicionales por tenant.

Historias:
1. Como negocio quiero que Owner sea obligatorio para estado Autorizada.
2. Como tenant quiero poder activar observador obligatorio para aprobacion dual.
3. Como aprobador quiero registrar decision con trazabilidad (quien, cuando, motivo).

### Epic D - Preaprobacion informativa
Objetivo: habilitar salida informativa sin comprometer autorizacion final.

Historias:
1. Como vendedor quiero compartir propuesta informativa cuando el margen supere umbral alto.
2. Como sistema quiero incluir leyenda obligatoria de documento no final.
3. Como negocio quiero impedir que una propuesta informativa se marque como emitida final sin autorizacion.

### Epic E - Notificaciones email/slack
Objetivo: reducir tiempo de ciclo de aprobacion.

Historias:
1. Como Owner quiero recibir email cuando haya aprobaciones pendientes.
2. Como tenant quiero recibir alertas por Slack cuando exista integracion activa.
3. Como sistema quiero reenviar recordatorios por SLA vencido.

### Epic F - Dashboard comercial por tenant
Objetivo: medir desempeno por vendedor y vista ejecutiva general.

Historias:
1. Como Owner quiero ver resumen por vendedor con KPI y riesgo operativo.
2. Como Superadmin quiero ver resumen general por tenant y comparativos.
3. Como vendedor quiero ver solo mis metricas personales.

## 16) Tareas tecnicas por epic

### Epic A - Politica de margen por tenant
1. Crear tablas de configuracion por tenant:
- margin_policy (tenant_id, min_margin, max_margin, high_preapproval_margin, require_observer, updated_by, updated_at)
2. Crear Zod schemas de validacion.
3. Crear API route para lectura/escritura de politica.
4. Agregar controles UI en Configuracion.
5. Agregar auditoria de cambios.

### Epic B - Motor de decision de liberacion
1. Implementar servicio de evaluacion de margen por propuesta y por linea (si aplica).
2. Persistir resultado de evaluacion y razon.
3. Actualizar transiciones de estado en backend.
4. Agregar pruebas unitarias de reglas.
5. Agregar pruebas de integracion para flujos en rango/fuera de rango.

### Epic C - Aprobaciones formales
1. Crear tablas:
- proposal_approvals (proposal_id, approver_user_id, role, decision, reason, created_at)
- proposal_approval_requirements (proposal_id, requires_owner, requires_observer, status)
2. Implementar endpoints de aprobar/rechazar.
3. Restringir cambio a Autorizada sin Owner.
4. Agregar timeline de aprobaciones en UI.
5. Agregar politicas de autorizacion por rol.

### Epic D - Preaprobacion informativa
1. Agregar estado Preaprobada informativa.
2. Implementar bandera isInformativeOutput en generador PDF/email.
3. Insertar leyenda obligatoria en template informativo.
4. Bloquear transicion directa a Emitida final desde informativa.
5. Probar regresion en plantillas externas para no incluir semaforos internos.

### Epic E - Notificaciones email/slack
1. Crear eventos de dominio (approval.requested, approval.reminder, approval.completed).
2. Integrar canal email en worker/queue.
3. Integrar Slack webhook por tenant (opcional).
4. Crear plantilla de mensajes y fallback de error.
5. Registrar estado de entrega notificacion.

### Epic F - Dashboard comercial por tenant
1. Definir vistas/materializaciones KPI por periodo.
2. Implementar endpoints de resumen por vendedor y resumen general.
3. Implementar filtros por rango de fecha, vendedor y estado.
4. Construir UI con graficas de distribucion y tendencia.
5. Aplicar permisos por rol (Owner/Superadmin/Admin/Vendedor).

## 17) Priorizacion sugerida (MVP -> V2)

### MVP (obligatorio)
1. Epic A completa.
2. Epic B completa.
3. Epic C minima (Owner obligatorio + aprobacion/rechazo).
4. Epic D minima (estado informativo + leyenda).
5. Epic E minima (email).

### V1.5
1. Epic C extendida (observador configurable).
2. Epic E Slack opcional.
3. Epic F resumen por vendedor.

### V2
1. Epic F resumen general avanzado y comparativos multi-periodo.
2. Alertas predictivas de riesgo y cuellos de botella.

## 18) Dependencias y orden de ejecucion
1. Primero: Epic A (sin politica no hay evaluacion).
2. Segundo: Epic B (motor de decision).
3. Tercero: Epic C (aprobaciones formales).
4. Cuarto: Epic D (preaprobacion informativa).
5. Quinto: Epic E (notificaciones).
6. Sexto: Epic F (analitica y dashboards).

## 19) Definition of Ready (DoR) por historia
Una historia entra a desarrollo solo si:
1. Tiene criterio de aceptacion claro.
2. Define rol actor y estado esperado.
3. Identifica dependencias de datos y permisos.
4. Incluye reglas de tenant y validacion multi-tenant.
5. Tiene impacto UI/API definido.

## 20) Definition of Done (DoD) por historia
Una historia se considera terminada si:
1. Cumple criterios de aceptacion funcional.
2. Tiene pruebas unitarias/integracion pasando.
3. Valida aislamiento por tenantId.
4. No expone semaforos internos en salidas externas.
5. Incluye logs y trazabilidad minima.
6. Esta documentada en changelog interno.

## 21) Validacion final de negocio
Checklist para sign-off:
1. Owner puede aprobar/rechazar y dejar propuesta en Autorizada.
2. Fuera de rango no emite sin excepcion.
3. Preaprobada informativa incluye leyenda y no es emision final.
4. Owner y Superadmin ven resumen por usuario y desempeno general.
5. Vendedor solo ve su informacion.

## 22) Plan de sprints sugerido

### Sprint 1 - Fundacion de liberacion
Objetivo: dejar lista la politica de margen y el evaluador base.

Alcance:
1. Modelo de configuracion por tenant.
2. API de lectura/escritura de politica de margen.
3. Validacion de margen en backend.
4. Estados base de propuesta para rango/fuera de rango.
5. Pruebas unitarias de reglas de negocio.

Entregable:
- Un tenant puede definir margen minimo, maximo y umbral alto.
- El sistema clasifica propuestas en rango o fuera de rango.

### Sprint 2 - Aprobaciones y excepciones
Objetivo: asegurar gobierno comercial minimo con Owner y excepcion controlada.

Alcance:
1. Flujo de aprobacion/rechazo.
2. Regla Owner obligatorio.
3. Regla observador configurable.
4. Bloqueo de autorizacion sin aprobadores requeridos.
5. Auditoria de decisiones y revalidacion por cambios.

Entregable:
- Una propuesta no puede pasar a Autorizada sin cumplir aprobadores requeridos.
- Cualquier cambio de margen invalida aprobaciones previas.

### Sprint 3 - Preaprobacion informativa y notificaciones
Objetivo: permitir salida comercial rapida sin romper control de riesgo.

Alcance:
1. Estado Preaprobada informativa.
2. Generacion de salida informativa con leyenda obligatoria.
3. Integracion de notificacion por email.
4. Slack opcional por tenant.
5. Recordatorios por aprobacion pendiente.

Entregable:
- Propuestas de alta rentabilidad pueden compartirse como informativas.
- Los aprobadores reciben notificacion automatica.

### Sprint 4 - Analitica y dashboard ejecutivo
Objetivo: dar visibilidad a Owner y Superadmin sobre desempeno por usuario y general.

Alcance:
1. KPIs por vendedor.
2. KPIs globales por tenant.
3. Resumen por usuario para Owner y Superadmin.
4. Resumen general con tendencias y rankings.
5. Semaforizacion interna en dashboards.

Entregable:
- Owner y Superadmin pueden ver desempeno individual y global.
- El sistema entrega graficas y tablas para gestion comercial.

### Sprint 5 - Endurecimiento y cierre
Objetivo: asegurar calidad, seguridad y consistencia multi-tenant.

Alcance:
1. Pruebas de regresion.
2. Validacion de aislamiento por tenantId.
3. Verificacion de salidas externas sin semaforos internos.
4. Ajustes de UX y accesibilidad.
5. Documentacion final y checklist de salida.

Entregable:
- Feature listo para despliegue y adopcion controlada.

## 23) Recomendacion de secuencia real de arranque
Si se inicia desarrollo de inmediato, el orden recomendado es:
1. Sprint 1.
2. Sprint 2.
3. Sprint 3.
4. Sprint 4.
5. Sprint 5.

## 24) Observaciones de producto
1. Owner y Superadmin no solo revisan aprobaciones: tambien consumen el dashboard ejecutivo para diagnostico comercial.
2. La semaforizacion interna debe usarse como insumo de analitica, no como marca visible al cliente.
3. La preaprobacion informativa es una herramienta comercial, no una sustitucion de autorizacion.

## 25) Backlog operativo por sprint

### Sprint 1 - Fundacion de liberacion
Prioridad: Critica

Historias operativas:
1. Configurar politica de margen por tenant.
	- Estimacion: Alta
	- Dependencias: modelo de datos, Zod, API de configuracion.
2. Evaluar propuesta contra margen minimo/maximo.
	- Estimacion: Alta
	- Dependencias: politica por tenant, estado base de propuesta.
3. Clasificar propuesta en rango/fuera de rango.
	- Estimacion: Media
	- Dependencias: motor de evaluacion.
4. Persistir resultado de evaluacion y razon.
	- Estimacion: Media
	- Dependencias: modelo de auditoria, backend de propuestas.

Salida esperada:
- El sistema ya decide si una propuesta puede seguir o no por politica de margen.

### Sprint 2 - Aprobaciones y excepciones
Prioridad: Critica

Historias operativas:
1. Exigir aprobacion de Owner para autorizacion final.
	- Estimacion: Alta
	- Dependencias: flujo de aprobaciones, roles, auditoria.
2. Permitir regla de observador configurable por tenant.
	- Estimacion: Media
	- Dependencias: politica por tenant, UI de configuracion.
3. Registrar aprobacion/rechazo con trazabilidad.
	- Estimacion: Media
	- Dependencias: tabla de approvals, timeline.
4. Invalidar aprobaciones si cambia margen o precio.
	- Estimacion: Media
	- Dependencias: motor de revalidacion, eventos de cambio.

Salida esperada:
- Ninguna propuesta pasa a Autorizada sin cumplir la politica de aprobacion.

### Sprint 3 - Preaprobacion informativa y notificaciones
Prioridad: Alta

Historias operativas:
1. Activar estado Preaprobada informativa por rentabilidad alta.
	- Estimacion: Media
	- Dependencias: umbral alto por tenant, estados de propuesta.
2. Generar salida informativa con leyenda obligatoria.
	- Estimacion: Media
	- Dependencias: templates PDF/email, flag de salida informativa.
3. Enviar notificacion por email al Owner.
	- Estimacion: Media
	- Dependencias: servicio de email, eventos de aprobacion.
4. Enviar notificacion por Slack cuando aplique.
	- Estimacion: Media
	- Dependencias: integracion por tenant, webhook Slack.

Salida esperada:
- El vendedor puede compartir una version informativa sin perder control de autorizacion.

### Sprint 4 - Analitica y dashboard ejecutivo
Prioridad: Alta

Historias operativas:
1. Calcular KPIs por vendedor.
	- Estimacion: Alta
	- Dependencias: eventos de propuesta, aprobaciones, estados.
2. Calcular KPIs globales del tenant.
	- Estimacion: Alta
	- Dependencias: agregaciones, periodos, tenantId.
3. Mostrar resumen por usuario para Owner y Superadmin.
	- Estimacion: Media
	- Dependencias: permisos por rol, UI de dashboard.
4. Mostrar resumen general con tendencias y rankings.
	- Estimacion: Alta
	- Dependencias: graficas, filtros de periodo.

Salida esperada:
- Owner y Superadmin pueden ver desempeno individual y global con datos accionables.

### Sprint 5 - Endurecimiento y cierre
Prioridad: Media

Historias operativas:
1. Probar aislamiento estricto por tenantId.
	- Estimacion: Media
	- Dependencias: suite de pruebas, seeds por tenant.
2. Verificar que salidas externas no incluyan semaforos internos.
	- Estimacion: Media
	- Dependencias: templates, snapshot tests.
3. Ajustar UX y accesibilidad de flujos de aprobacion.
	- Estimacion: Media
	- Dependencias: feedback funcional, componentes UI.
4. Documentar checklist final de salida.
	- Estimacion: Baja
	- Dependencias: cierre funcional, version final del backlog.

Salida esperada:
- Feature listo para despliegue, controlado y sin fugas de informacion interna.

## 26) Matriz de permisos y visibilidad por rol

### Owner
Permisos:
1. Ver todas las propuestas del tenant.
2. Ver resumen por usuario vendedor.
3. Ver resumen general del desempeno.
4. Aprobar o rechazar propuestas.
5. Definir o ajustar politica de margen del tenant segun permisos administrativos.

Puede ver:
1. Estado de cada propuesta.
2. Motivos de bloqueo o excepcion.
3. Tiempos de aprobacion y reproceso.
4. KPIs individuales y globales.

No debe ver en salidas externas:
1. Semaforos internos.
2. Etiquetas de riesgo o aprobacion interna en documentos de cliente.

### Superadmin
Permisos:
1. Ver informacion multi-tenant o segun alcance asignado.
2. Ver resumen por usuario vendedor.
3. Ver resumen general de desempeno.
4. Auditar configuraciones y comportamiento del tenant.
5. Revisar trazabilidad completa de aprobaciones y liberaciones.

Puede ver:
1. Comparativos entre tenants.
2. Patrones de riesgo por tenant.
3. Indicadores de adopcion y salud comercial.

No debe ver en salidas externas:
1. Semaforos internos expuestos al cliente.
2. Leyendas de control interno en PDF/email comercial.

### Admin
Permisos:
1. Operar aprobaciones segun politica configurada.
2. Atender excepciones.
3. Gestionar configuracion operativa.
4. Ver metricas segun lo permita el tenant.

### Vendedor
Permisos:
1. Ver solo sus propuestas.
2. Ver el estado operativo de sus propuestas.
3. Ver sus metricas personales basicas.
4. Recibir notificaciones relacionadas con sus propuestas.

## 27) Reglas de visualizacion interna vs externa

### Vistas internas
Pueden mostrar:
1. Semaforos por estatus.
2. Tiempos de autorizacion.
3. Motivos de rechazo o excepcion.
4. Riesgo comercial y fricciones de aprobacion.

### Vistas externas para cliente
Deben mostrar solo:
1. Contenido comercial final o informativo autorizado.
2. Leyendas requeridas por preaprobacion informativa.
3. Identidad visual comercial del tenant.

No deben mostrar:
1. Semaforos internos.
2. Reglas de aprobacion.
3. Estados de riesgo o excepcion.
4. Lenguaje de gobierno interno.

## 28) Checklist de control de acceso
Antes de liberar el feature, validar que:
1. Owner puede ver y aprobar todo dentro de su tenant.
2. Superadmin puede ver resumen por usuario y desempeno general segun alcance.
3. Admin no excede permisos de aprobacion configurados.
4. Vendedor no accede a datos de otros usuarios.
5. Ningun documento externo expone semaforos ni etiquetas internas.
6. Toda consulta de datos filtra por tenantId.

## 29) Cierre funcional esperado
Al completar estas iniciativas, el sistema deberia permitir:
1. Liberar propuestas por margen con reglas claras.
2. Preaprobar propuestas de alta rentabilidad sin perder control.
3. Exigir aprobacion formal cuando aplique.
4. Medir desempeno comercial por vendedor y por tenant.
5. Dar visibilidad ejecutiva a Owner y Superadmin sin exponer informacion interna al cliente.

## 30) Tabla de implementacion por modulo

| Modulo | Proposito | Entregables principales | Dependencias |
| --- | --- | --- | --- |
| Configuracion de tenant | Definir politica de margen y reglas de aprobacion | Politica por tenant, validaciones Zod, UI de configuracion | Modelo de datos, permisos, tenantId |
| Motor de liberacion | Evaluar rango, preaprobacion y bloqueo | Servicio de evaluacion, estados de propuesta, invalidacion por cambios | Configuracion de tenant, backend de propuestas |
| Aprobaciones | Gestionar autorizacion formal | Flujo approve/reject, Owner obligatorio, observador configurable | Roles, auditoria, notificaciones |
| Preaprobacion informativa | Habilitar salida rapida al cliente | Estado informativo, templates con leyenda, bloqueo de emision final | Motor de liberacion, templates PDF/email |
| Notificaciones | Avisar a Owner/Superadmin y otros roles | Email obligatorio, Slack opcional, recordatorios | Eventos de dominio, integracion externa |
| Analitica por vendedor | Medir calidad y conversion comercial | KPIs por usuario, distribucion semaforo, riesgo y tiempos | Eventos, historico de propuestas, permisos |
| Analitica ejecutiva | Dar vista general de tenant | Resumen general, tendencias, ranking, comparativos | KPIs consolidados, filtros por periodo |
| Seguridad y aislamiento | Evitar fugas entre tenants y salidas externas | Control tenantId, validacion de permisos, pruebas de regresion | Auth, RLS/logica de acceso, snapshots |

## 31) Orden tecnico de construccion por modulo
1. Configuracion de tenant.
2. Motor de liberacion.
3. Aprobaciones.
4. Preaprobacion informativa.
5. Notificaciones.
6. Analitica por vendedor.
7. Analitica ejecutiva.
8. Seguridad y aislamiento.

## 32) Nota de despliegue funcional
Antes de activar el feature en produccion:
1. Verificar politicas de tenant cargadas.
2. Ejecutar pruebas de propuestas en rango y fuera de rango.
3. Validar que Owner y Superadmin vean los resúmenes requeridos.
4. Confirmar que el cliente no recibe semaforos internos.
5. Confirmar trazabilidad completa de aprobaciones y notificaciones.

## 33) Plan de implementacion semana a semana

### Semana 1 - Fundacion de politicas
Objetivo: dejar lista la base normativa y de datos del tenant.

Entregables:
1. Modelo de politica de margen por tenant.
2. Validacion Zod para configuracion.
3. API de lectura y edicion de politica.
4. UI inicial para capturar margen minimo, maximo y umbral alto.

Dependencias:
1. tenantId disponible en toda operacion.
2. Roles y permisos basicos definidos.

Riesgo a controlar:
1. Configuracion incompleta o ambigua por tenant.

### Semana 2 - Motor de liberacion
Objetivo: decidir automaticamente si una propuesta avanza o queda bloqueada.

Entregables:
1. Evaluacion de margen al guardar propuesta.
2. Clasificacion en rango, fuera de rango o preaprobacion informativa.
3. Persistencia del resultado de evaluacion.
4. Bloqueo de emision automatica fuera de rango.

Dependencias:
1. Politica de margen por tenant lista.
2. Estados base de propuesta definidos.

Riesgo a controlar:
1. Divergencia entre evaluacion de backend y UI.

### Semana 3 - Aprobaciones formales
Objetivo: asegurar gobernanza minima con Owner y excepciones controladas.

Entregables:
1. Flujo approve/reject.
2. Regla Owner obligatoria.
3. Regla de observador configurable.
4. Auditoria de decisiones y revalidacion por cambios.

Dependencias:
1. Motor de liberacion funcionando.
2. Roles de autorizacion definidos.

Riesgo a controlar:
1. Permitir autorizacion sin aprobadores requeridos.

### Semana 4 - Preaprobacion informativa y notificaciones
Objetivo: habilitar salida rapida al cliente con control interno.

Entregables:
1. Estado Preaprobada informativa.
2. Leyenda obligatoria en salida externa.
3. Notificacion por email al Owner.
4. Slack opcional por tenant.

Dependencias:
1. Flujo de aprobaciones establecido.
2. Plantillas de salida definidas.

Riesgo a controlar:
1. Exponer semaforos internos en salidas externas.

### Semana 5 - Analitica por vendedor
Objetivo: medir calidad comercial individual y comportamiento operativo.

Entregables:
1. KPIs por vendedor.
2. Distribucion semaforo por usuario.
3. Tiempos de aprobacion y reproceso.
4. Resumen por usuario para Owner y Superadmin.

Dependencias:
1. Eventos de propuesta y aprobacion historizados.
2. Permisos de lectura por rol.

Riesgo a controlar:
1. KPI mal calculado por falta de trazabilidad o filtros de tenant.

### Semana 6 - Analitica ejecutiva y cierre
Objetivo: consolidar vista general de tenant y cerrar endurecimiento.

Entregables:
1. KPIs globales del tenant.
2. Tendencias, ranking y comparativos.
3. Validacion de aislamiento multi-tenant.
4. Pruebas de regresion y checklist final.

Dependencias:
1. KPIs por vendedor listos.
2. Politicas y aprobaciones estables.

Riesgo a controlar:
1. Fugas de informacion o mezcla entre tenants.

## 34) Hitos de control semanales
1. Fin de semana 1: politica de margen configurable y persistente.
2. Fin de semana 2: motor de liberacion operativo.
3. Fin de semana 3: aprobaciones con Owner obligatorias.
4. Fin de semana 4: preaprobacion y notificaciones listas.
5. Fin de semana 5: analitica por vendedor visible.
6. Fin de semana 6: dashboard ejecutivo y validacion final completos.

## 35) Criterio de avance de fase
Una semana se considera cerrada solo si:
1. El entregable principal funciona en entorno de desarrollo.
2. Existen pruebas basicas pasando.
3. No hay fuga de tenantId.
4. La salida externa se mantiene limpia.
5. El Owner valida el resultado funcional.
