# Servicios recurrentes: entrega R1

Estado al 16 de noviembre de 2026: código para revisión, piloto apagado. Depende del
plan de #113. No se ejecutó SQL ni se cargaron clientes en una base operativa.
Base de implementación: main 0c1a58c2e312b5ec3d5ea067348711fc398072aa + documentación #113.

## Comportamiento disponible

El operador puede seleccionar un cliente activo de su empresa y guardar un borrador
incompleto. Un cliente ausente se da de alta mediante la sección existente de clientes,
resolviendo allí razón social, contacto y RFC; no se crea un tenant ni se fusiona por nombre.
R1 no agrega un detector de RFC duplicado ni un flujo nuevo de contactos.

Activar requiere condiciones completas y una referencia de aceptación capturada por
el operador. Esa referencia es una declaración humana: no verifica acceso al documento,
firma, licencia del fabricante ni aceptación externa. El formulario separa plazo del
contrato, frecuencia de cobro, preparación adelantada/vencida y pago esperado.

Se conservan precios y cantidades decimales como cadenas, sin cálculo paralelo de
IVA, margen o totales. El calendario registra intervalos completos [inicio, fin), día
ancla original y fechas locales; los actos llevan timestamptz. No hay instantes de
cobro programados ni conversión implícita de UTC a fechas contractuales.

Cada alta usa requestId UUID y huella del contenido. Reintentar el mismo contenido
recupera el acuerdo; cambiarlo con la misma clave produce conflicto. Cada modificación
usa revisión esperada y bloqueo transaccional. Registrar otra vez un intervalo conserva
un periodo único sin incrementar la revisión comercial. Un intervalo distinto solapado
se rechaza en SQL.

El precio, cantidad o días de pago de un acuerdo activo/pausado cambian mediante una
revisión futura desde un límite de periodo posterior a hoy, anterior al fin contractual
y no anterior al fin de periodos ya registrados. El calendario consulta la versión
vigente al inicio de cada periodo, conservando las anteriores. Cambiar cliente, moneda,
plazo, renovación o calendario de un acuerdo activo requiere otra revisión contractual;
R1 rechaza esos cambios.

Pausar bloquea nuevos periodos y conserva los ya planeados. Reanudar exige fecha actual
o futura en un límite de periodo, fija un piso que impide generar periodos anteriores
y no crea cargos omitidos. Terminar bloquea acciones posteriores. No hay listado dedicado
de periodos omitidos ni programación de tareas internas en R1.

La interfaz muestra 50 acuerdos por página y hasta 120 periodos recientes por acuerdo.
La búsqueda de clientes retorna 50 e indica cuando debe afinarse. Después de un fallo
incierto bloquea nuevas acciones hasta consultar el resultado. Al revocar acceso borra
los términos visibles. La página entrega datos iniciales del servidor y la consulta de
cartera obtiene periodos en lote, sin una petición por acuerdo.

## Acceso y migración: pasos pendientes de aprobación operativa

La migración manual es `cotiza-web/prisma/manual/20261116_recurring_services_r1.sql`.
Es aditiva, transaccional y no forma parte del build. Crea tablas propias, FK compuesta
a clientes, historial append-only y RLS con ámbito transaccional. Ejecutarla primero en
una copia autorizada del esquema vigente. No usar prisma db push.

Puertas simultáneas, apagadas salvo habilitación explícita:

| Control | Condición |
|---|---|
| Tenant | ID fijo del piloto SynAppsSys y slug sys activos |
| Capacidad | recurring_services_pilot habilitada; migración la inserta en false y preserva valores existentes |
| Entorno | COTIZA_RECURRING_ENABLED=true |
| Operadores | ID Clerk exacto incluido en COTIZA_RECURRING_OPERATOR_IDS, separados por coma |
| Facultad vigente | app_users activo; owner/admin de ese tenant, o rol administrativo global reconocido |
| Sesión | Clerk real y usuario coincidente; bootstrap rechazado |
| Mutaciones | X-Tenant-Context coincide, Origin y URL coinciden con COTIZA_RECURRING_APP_ORIGIN |
| Preview | Usa https://VERCEL_URL sólo cuando VERCEL_ENV=preview; no habilitar operadores reales por omisión |

Los roles administrativos siguen necesitando nominación en la lista de operadores.
No hay asignación nueva de roles ni configuración de esta capacidad en la UI general.
El repositorio revalida tenant, rol, usuario y capacidad bajo bloqueo en cada operación;
la visibilidad del menú por sí sola no autoriza operaciones. Apagar flag o capacidad
cierra acceso y conserva historia; no hacer rollback destructivo de tablas.

El rol real de PostgreSQL debe revisarse antes de habilitar: RLS no sustituye el
control de aplicación y un superusuario/BYPASSRLS puede eludirla. La variable de sesión
se establece con set_config(...,true) dentro de la transacción, nunca globalmente.

## Comprobaciones realizadas y límites

| Comprobación local | Resultado |
|---|---|
| Dominio, integración SQL/HTTP e interfaz DOM | 34 pruebas aprobadas |
| Suite general aislada | 1,289 aprobadas, 128 omitidas; E2E con BD real excluido |
| Build Next.js y TypeScript | Aprobados con DATABASE_URL sintética inoperante |
| ESLint de archivos TypeScript modificados | Aprobado |
| Chromium escritorio/móvil | Bloqueado localmente; pendiente en CI |


- Migración aplicada dos veces sobre PostgreSQL WASM desechable PGlite 0.5.16: un
  evento de capacidad, capacidad inicialmente deshabilitada, historial preservado.
- Pruebas de dominio y HTTP→repositorio→SQL con datos sintéticos: anclas 31 y bisiesto,
  calendarios, periodos completos, reintentos, cliente cruzado, CAS, pausas, revisiones,
  rollback por fallo de auditoría, historial y solapamiento. RLS consultada como rol
  no superusuario con ámbito ausente, correcto e incorrecto.
- Los mocks reemplazan únicamente transporte Prisma y sesión Clerk en esa integración;
  las sentencias, restricciones, repositorio y handlers son los reales. No hay servicio
  fiscal, correo, banco ni carga de clientes reales.
- PGlite serializa transacciones en una conexión. Esto NO acredita carreras entre dos
  backends PostgreSQL, revocación concurrente ni comportamiento del rol de producción.
  Verificar esos casos en copia/staging antes de habilitar el piloto.
- La suite general excluye validate-quote-lifecycle.e2e.test.ts, que declara escribir
  en una base real. DATABASE_URL de pruebas/build apunta a localhost:1 sin servicio.
- Se incluye recorrido Chromium sintético a 1360 y 390 px en
  scripts/check_recurring_services_ui.mjs. La ejecución local no pudo iniciar Chromium
  por restricción de sockets; no se declara validación visual aprobada. El workflow
  recurring-services-r1 ejecuta el recorrido en un runner aislado.

Las fechas de licencia y la vigencia de cotización aún NO se capturan en esta pantalla:
no pueden inferirse de fechas de servicio, preparación ni pago. Tampoco están entregados
importación XML/PDF, fiscalidad por periodo, pagos, REP, MRR, CIMA, tareas ni lectura
semanal de fuentes. Los cinco casos del piloto siguen pendientes de documentación y
alta privada; no aparecen sus datos en el repositorio público.

Recordia no cubre estas tablas mediante sus fuentes/triggers actuales. Los eventos
locales append-only son auditoría mínima; no equivalen a preservación Recordia o HotVault.
No se modifica el PR #112, no se llama al PAC y no se generan correos o compras.

## Reproducir en entorno aislado

Desde cotiza-web, después de npm ci y prisma generate:

```sh
PGLITE_MODULE=/ruta/temporal/node_modules/@electric-sql/pglite/dist/index.js \
  npx vitest run lib/domain/recurring-services.test.ts lib/db/recurring-services.integration.test.ts components/servicios/recurring-services-panel.test.tsx
DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:1/unused \
  npx vitest run --exclude validate-quote-lifecycle.e2e.test.ts
npx tsc --noEmit
```

El workflow instala herramientas de pruebas temporalmente, sin dependencias nuevas de
producción. El recorrido UI intercepta todo /api/ y rechaza cualquier origen externo.
