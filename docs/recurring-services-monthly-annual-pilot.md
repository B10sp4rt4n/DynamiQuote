# Suscripciones CDC: piloto mensual y anual

28 de noviembre de 2026. Preparado para revisión; acceso deshabilitado por defecto.

## Alcance autorizado

Se recuperan sobre main los acuerdos, versiones, calendario y avisos de los PR
#113, #114 y #116. Los conflictos de navegación se resuelven preservando Compras
y su autorización actual. Suscripciones usa la ruta /servicios-recurrentes.

El piloto opera únicamente:

| Modalidad | Contrato | Frecuencia | Resultado del calendario |
| --- | --- | --- | --- |
| Mensual renovable | Mes a mes | Mensual | Periodos independientes dentro de la vigencia |
| Anual con pago único | Plazo fijo de doce meses | Anual | Un periodo; renovación requiere decisión explícita |

El calendario genérico conserva la posibilidad de anual facturado mensualmente,
pero la política del piloto lo rechaza en servidor y no lo ofrece en la captura.
Trimestral también queda fuera del piloto. El servidor aplica la política en alta,
revisión, activación, reanudación y planificación; las pausas y cierres permanecen
posibles para conservar control sobre acuerdos históricos.

Un acuerdo anual no acredita un pago recibido, ni establece por sí solo PUE/PPD.
La pantalla registra condiciones comerciales y planea periodos. No emite CFDI,
registra pagos, crea oportunidades ni manda comunicaciones. Los términos de pago
siguen siendo explícitos, independientes de la frecuencia de facturación.

## Incorporación de empresas existentes

Cada acuerdo debe vincularse al client_id exacto de SynAppsSys. Los clientes no
son tenants nuevos. No se crean ni fusionan por nombre o correo. Antes de cargar:
confirmar modalidad, fechas, moneda, precios por periodo, renovación/preaviso,
condiciones de pago y referencia de aceptación. No inferir pago o vigencia de
licencia a partir del acuerdo. No se cargaron datos reales en esta entrega.

## Validación y liberación

Pruebas aisladas de dominio, HTTP/SQL, interfaz y navegación; las pruebas SQL usan
PostgreSQL WASM desechable. Verifican calendario, periodo anual único, reintento,
rechazo HTTP de anual mensualizado, aislamiento y revocación. No acreditan carreras
entre backends PostgreSQL ni el rol de la base operativa.

Antes de activar: validar migración aditiva y rollback no destructivo en staging,
concurrencia PostgreSQL y privilegios reales, cuentas nominadas y aceptación de
un cliente mensual y uno anual. La migración no se ejecuta en el build. Permanecen
los controles COTIZA_RECURRING_ENABLED, lista de operadores, tenant y capacidad.
No se modificaron configuraciones, credenciales ni producción.

## Orden de las próximas entregas

1. Vínculo por acuerdo/periodo con facturas existentes, sin retimbrar históricos.
2. Preparación fiscal por periodo con idempotencia y recuperación de resultado incierto.
3. Notificaciones internas y borradores de correo sujetos a autorización explícita;
   mensajería requiere destinatario/canal autorizados y registro de entrega.
4. CIMA: facturado, cobrado y pendiente, sin sumar mensualidades como ventas nuevas.
5. Autofacturación de cliente y emisión recurrente bajo políticas explícitas.

Estas etapas son pendientes, no prestaciones entregadas por este PR. La sesión
única de CDC también permanece como trabajo separado.

## Resultado de esta preparación

- 63 pruebas aprobadas en seis archivos: dominio, renovaciones, HTTP/SQL con
  PostgreSQL WASM, interfaz DOM, layout y navegación.
- TypeScript, ESLint de archivos modificados y build Next.js aprobados.
- La aceptación Chromium local quedó pendiente: el lanzador disponible no tiene
  su binario y la descarga del navegador devolvió HTTP 403. El workflow conserva
  la prueba visual de escritorio/móvil, pero no se ejecutó CI de esta entrega.
- Cambio conservado localmente. Publicar la rama/PR requiere resolver la
  autorización explícita de publicación; no se fusionó ni desplegó.
