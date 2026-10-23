# Evidencia fiscal del checkpoint f3683dc8

Este informe conserva resultados de una versión concreta y no sustituye la
validación de la cabeza actual. Durante un timeout de navegador la rama avanzó
17 commits hasta a0bc4b1f, incluidos privacidad del directorio, comparación del
draft previo y herramientas de respaldo. Se preservaron todos esos cambios.
La fuente f3683dc8 y su restauración de 411 archivos son un checkpoint histórico,
**no un fallback productivo aprobado** que permita omitir las correcciones nuevas.
La política vigente de usuarios es habilitar únicamente operadores reales
aprobados y mantener pruebas pending/legacy excluidas, sin vínculos, invitaciones
o borrados automáticos; no exige recuperar cada cuenta de prueba.

## Verificación del checkpoint fiscal f3683dc8

Salvador precisó que trabaja en https://dynami-quote.vercel.app/cotizaciones.
La API Vercel resolvió ese alias a producción/main/55760ab4, deployment
dpl_GvKryAuSHx1QQe22MNAUymSiUKwG, READY. La inferencia conversacional de que
usaba Railway queda retirada; no se había verificado ese uso. El plan conserva
su enlace actual y mantiene abierta la investigación de otros consumidores
que pudieran llegar al servicio Railway conectado a producción.

La revisión fiscal detectó los PR #5 de DynamiQuote y #2 de digestor__fiscal aún
abiertos/borrador. El candidato CRM incorpora el trabajo Cotiza de 3a09ccb2 sin
fusionar ese PR ni el del backend. Se añadieron la misma visibilidad por vendedor
al nuevo POST de conciliación y guardas que rechazan borrar/sobrescribir UUID,
XML o fecha de timbrado existentes aunque el estado histórico fuera incoherente.
Se comprueba también el resultado de la transición a rechazo, sin declarar
liberada una reserva si cambió mientras se procesaba.

Las actualizaciones comparan tenant, propuesta, draft y estado esperado en la
propia escritura. Un timeout conserva stamping y bloquea reintento/regeneración;
Consultar estado lee el resultado persistido mediante GET en Digestor y actualiza
el estado local sin otro timbre. La interfaz muestra el bloqueo y la consulta.
No añade actos fiscales al contrato AUP; la memoria comercial sigue local_only.

Código remoto f3683dc83a7e901fd9fe77f2abb048e047c6ff23, equivalente local
48898988f68e383646bf48a1169270d9cf9621da; árbol
2870832362f0d46534f98f4fdc11a09b9a8b669b. Validación: 543 pruebas generales
aprobadas y dos opcionales omitidas en 57 archivos; 50 casos DB local aprobados,
40 previos y 10 fiscales nuevos, con PostgreSQL/PGlite, servicios Prisma y handlers
reales y proveedor fiscal simulado. Incluye concurrencia, timeout/consulta sin
reemisión, acceso de vendedor/otro tenant y conservación de evidencia histórica.
TypeScript y ESLint de cambios pasan. next build --webpack local pasó usando
dependencias existentes y sin credenciales utilizables; no es instalación limpia.
Catorce comprobaciones HTTP locales pasan: doce cierres y dos reaperturas, incluida
la conciliación bajo mantenimiento. Se restauraron/verificaron 411 archivos de
fuente fija; no se restauró base ni se probó rollback del hosting.

La consulta de producción y copia solo leyó catálogo y agregados: invoice_status
es text sin CHECK fiscal; no requiere migración para admitir stamping. Ambas
ramas muestran un registro stamped con UUID/XML no vacíos; cero estados
inesperados, stamping pendientes o evidencia con estado incoherente. Hay 205
propuestas sin estado fiscal en producción y 207 en copia, que contiene fixtures.
Los contadores no verifican firma XML o verdad comercial y deben repetirse en
la ventana de corte. No se cambió el registro timbrado ni dato productivo.

El inventario estático suma 39 rutas mutadoras, incluida conciliación; no acredita
cada rama ni ausencia de escritores externos. Una primera ejecución general
incluyó el E2E antiguo que escribe en base real y falló al importar por falta de
DATABASE_URL, antes del setup; el comando final lo excluye y ejecuta DB local por
separado. El ensayo HTTP falló primero en un worktree por symlink de dependencias
fuera de la raíz Turbopack y pasó desde el checkout canónico, sin alterar config.

Evidencia: docs/evidence/crm-fiscal-integration-verification.json, logs de build y
DB, crm-fiscal-maintenance-http.json y crm-fiscal-recovery-source-manifest.json.
El expediente registra por separado el resultado final de Preview. Queda validar
y desplegar Digestor compatible antes de liberar el CRM, aprobar y verificar únicamente a los
operadores reales del lanzamiento, controlar/drenar escritores, respaldo/preflight de corte
y aprobación final. Sin timbres reales, correos, invitaciones, migración o
promoción productiva; Railway sin detener o reconfigurar.

## Cierre de la comprobación remota y cambios posteriores

Vercel confirmó READY para dpl_GFj6zx5txLzNMbHtNAXXo9NCZWJF, fuente f3683dc8,
target Preview. La apertura de /inicio mediante el navegador terminó en timeout
de la herramienta; no se certifica login ni flujo fiscal remoto de esa versión y
no se atribuye la demora a una falla de la aplicación. El alias productivo siguió
en dpl_GvKryAuSHx1QQe22MNAUymSiUKwG/main/55760ab4 en la lectura final.

Los resultados locales de 543 generales y 50 integraciones pertenecen solo a
f3683dc8. La cabeza posterior a0bc4b1f tiene CI propia verificada como completed /
success en https://github.com/B10sp4rt4n/DynamiQuote/actions/runs/39969779692.
No se declara ejecución local independiente de esos cambios posteriores ni
respaldo real de producción por una prueba sintética de recuperación.
