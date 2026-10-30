# Experiencia CRM piloto sobre Cotiza actual

## Acceso y alcance

`/crm` requiere sesión Clerk identificada, vínculo exacto con un usuario activo de la aplicación y capacidad `crm_workspace_pilot` activa en el tenant de sesión. El menú y la página comprueban el mismo helper de acceso. Un usuario sin vínculo, inactivo, de otro tenant, sin identidad o en bootstrap no abre el piloto. La capacidad continúa administrada sólo por superadmin; esta entrega no la activa ni cambia roles.

El ejecutivo tiene «Mi día» y «Oportunidades». La consulta limita por tenant y propietario en base de datos, antes de derivar estados o serializar datos. Sólo aparecen sus oportunidades y las tareas que él creó. Los registros sin responsable quedan fuera de esta vista. Tampoco se consulta ni se entrega el catálogo completo de clientes, los logos o el directorio de vendedores; no aparecen el filtro de vendedores, Clientes y seguimiento ni enlaces al historial global de una cuenta. Owner y admin reciben esta misma vista personal dentro del piloto.

Superadmin conserva «Mi día», «Oportunidades» y «Clientes y seguimiento», con los datos del tenant seleccionado en su sesión. Su rol se verifica también contra el registro activo de la aplicación. No se usa el tenant del usuario global como sustituto del tenant de sesión ni se concede acceso a tenants con la capacidad apagada.

## Completar una oportunidad desde el CRM

1. El ejecutivo crea su cotización con «Nueva oportunidad». Nombre, necesidad y origen pueden quedar incompletos.
2. En CRM · Piloto abre «Ver mis oportunidades» u «Oportunidades».
3. El aviso «Completar datos de oportunidad» abre la cotización de origen mediante su `quoteId`.
4. «Completar datos de la oportunidad» admite guardar avances. Tras recargar, el aviso continúa mientras falte algún campo requerido.
5. Al completar los tres campos, el aviso desaparece también al volver a consultar el CRM.

La página reutiliza los lectores y componentes actuales. El enlace conserva las comprobaciones de tenant y vendedor del cotizador. Las rutas de alta comercial existentes comprueban propietario y revisión vigente; no se agrega otro escritor ni se confía en datos de tenant/actor enviados por el navegador.

## Compatibilidad y límites

Las opciones nuevas de los lectores excluyen registros sin responsable sólo cuando el CRM lo solicita. Inicio, Pipeline y sus demás llamadores conservan su comportamiento anterior. Los enlaces a clientes de los componentes compartidos siguen habilitados por defecto; el CRM personal los deshabilita.

El cambio no modifica permisos de otras páginas o APIs, ni la autorización de propuestas, su envío, desenlace o facturación. No cambia la recuperación por UUID del formulario de creación. No agrega esquema, migraciones, servicios ni llamadas de IA. No fusiona ni sustituye PR28/33.

Superadmin conserva los flujos actuales de catálogo y seguimiento. Desactivar la capacidad retira el menú y devuelve 404 para `/crm`, sin borrar información comercial. No se envían mensajes ni se crean seguimientos automáticos.

## Verificación reproducible

Para las pruebas generales, desde la raíz:

```sh
npm --prefix cotiza-web test -- --exclude '**/*e2e*'
```

El e2e heredado necesita una base externa; las suites de integración se habilitan por separado. Instalar las dependencias sólo en un directorio temporal, sin agregarlas al producto:

```sh
npm install --prefix /tmp/cotiza-crm-pg --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.11 @electric-sql/pglite-socket@0.2.14
PGLITE_MODULE=/tmp/cotiza-crm-pg/node_modules/@electric-sql/pglite/dist/index.js \
PGLITE_SOCKET_MODULE=/tmp/cotiza-crm-pg/node_modules/@electric-sql/pglite-socket/dist/index.js \
node scripts/check_crm_workspace.mjs
```

El harness inicializa un esquema vacío en PGlite en memoria sobre loopback. Nunca utiliza la `DATABASE_URL` de la aplicación ni ejecuta una migración en Neon. Corre cinco integraciones nuevas con lectores reales, render del servidor y los handlers existentes: pertenencia, acceso activo, capacidad, datos propios, avances, recarga por relectura, completado y conflicto. Los fixtures de autorización y metadata de facturación conservan todos sus campos. Corre además las diez integraciones previas de alta diferida y v1/opciones.

La identidad de sesión se simula en las pruebas. No acreditan una sesión Clerk real, una operación comercial auténtica ni concurrencia PostgreSQL nativa entre procesos. La publicación y la prueba real en SynAppsSys permanecen como pasos separados, con cliente/negocio auténticos y registro autorizado.

Resultados de esta entrega: 538 pruebas generales aprobadas y 40 omitidas por sus condiciones; 15 integraciones aprobadas por separado (5 del piloto y 10 de regresión). TypeScript, ESLint de los archivos modificados y build Next.js aprobados con configuración local sintética. No se publicaron cambios productivos.
