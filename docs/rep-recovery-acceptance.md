# Aceptación conectada de recuperación REP

El recorrido usa los handlers de Cotiza y su autorización/Prisma reales, HTTP
con JWT y rutas de Digestor con PostgreSQL real. Sólo la identidad humana y el
PAC son sintéticos. Las dos bases se limitan a loopback y nombres desechables;
no se usan credenciales ni documentos de clientes. El fixture bloquea la red del
PAC y vacía sus tokens. No se ejecutan los scripts públicos que emiten en QA.

## Casos comprobados

1. Respuesta del registro de pago perdida después de persistir: repetir la misma
   intención recupera el mismo pago; cambiar la clave con la misma referencia
   conserva el conflicto 409 y no duplica el dinero.
2. Dos emisiones simultáneas: un trabajador reserva y llama al proveedor; la
   segunda solicitud y la recuperación mientras sigue processing reciben 409.
3. Respuesta del REP perdida después de persistir, más primera lectura perdida:
   la consulta siguiente recupera el mismo UUID y XML sin otra emisión.
4. Respuesta sintética del PAC perdida antes de persistir: unknown bloquea el
   reenvío y rechaza un UUID ajeno; dos recuperaciones simultáneas confirman el
   mismo REP y agregan un único acto recovered. Repetir la recuperación no llama
   otra vez al proveedor.
5. Dos pagos de 58, parcialidades 1/2, saldos 116→58→0, base50/IVA8 por parcialidad.
   El XML descargado coincide byte por byte con el aceptado; el PDF contiene el
   mismo UUID. Un vendedor o tenant ajenos no acceden al documento.

La comprobación SQL independiente conserva las dos declaraciones de pago y el
XML original de la factura. El informe sintético de CI registra contadores y
hashes del XML aceptado/recuperado. Las pruebas de UI cubren doble clic y cortes
de red; el navegador de escritorio/móvil distingue processing de unknown.

## Corrección de pantalla

Mientras el REP está processing se ofrece consultar saldo y estado. El campo de
UUID y la recuperación se muestran sólo al estar unknown, siguiendo el bloqueo
que ya aplica Digestor. Un fallo de comunicación no habilita otro timbrado ni
invita a registrar de nuevo el cobro. Los conflictos HTTP409 se conservan.

## Reproducción

Crear bases locales desechables cotiza_synthetic y digestor_fiscal_test;
inicializar la primera con el esquema Prisma. Definir COTIZA_TEST_DATABASE_URL,
REP_FIXTURE_DATABASE_URL (driver postgresql+psycopg), DIGESTOR_FIXTURE_ROOT y
DIGESTOR_FIXTURE_PYTHON; ejecutar node scripts/check_rep_recovery.mjs.
La comprobación rechaza destinos externos. El workflow dedicado conserva un
commit exacto de Digestor y ejecuta el recorrido junto con la compilación Next.

El recorrido conectado y 53 pruebas dirigidas backend pasaron localmente con
PostgreSQL18.6; la regresión de pantalla falló antes del ajuste y pasó después.
La evidencia final de CI se registra en el PR. Esto cierra la aceptación técnica
controlada, no la prueba productiva PPD/REP ni los dos incidentes históricos del
PAC QA. El usuario no tiene aún un PPD real: esa validación permanece pendiente.
