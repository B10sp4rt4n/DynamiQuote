# Ficha del negocio y seguimiento del cierre

La ficha deja de presentar la ubicación en Oportunidad/Cotización/Propuesta como avance. El componente compartido es navegación: marca **Sección actual**, conserva los números y abre los documentos vinculados. No infiere que algo esté pendiente o completado por la página abierta.

La cabecera muestra folio, resultado, cliente, responsable, fecha del cierre cuando existe e importe con moneda procedente de las propuestas del resultado correspondiente. Las revisiones de una misma cotización se agrupan para el conteo. Los documentos conservan su estado de autorización, resultado y envío por separado.

La siguiente acción se deriva de los registros accesibles:

- Abierta: revisar la propuesta existente, continuar una cotización o crear la primera si no hay documentos.
- Ganada: preparar/revisar prefactura, verificar un timbrado incierto o revisar el CFDI y pagos, según la evidencia registrada y la habilitación del tenant.
- Ganada sin documentos visibles: indicar el cierre registrado y consultar antecedentes; no imponer la creación de documentos para reconstruir el pasado.
- Pausada, perdida o cerrada sin decisión: consultar el seguimiento o los antecedentes del cierre.

Un UUID acredita aquí un **CFDI registrado**, sin afirmar vigencia ante SAT, saldo o pago. Un estado stamped sin UUID conduce a verificación. Los enlaces abren los controles existentes de la propuesta; esta vista no emite, cobra, cancela ni modifica resultados.

La moneda faltante queda **por confirmar**. Si las propuestas relevantes muestran varias monedas, la ficha y su diálogo de revisión omiten la suma agregada y piden consultar cada propuesta. No se recalculan importes ni KPIs ni se convierte moneda. Las fechas de cierre se presentan en horario de Ciudad de México sin reconstruir fechas desconocidas.

La consulta conserva los filtros de tenant, vendedor y pertenencia al negocio; añade únicamente los campos existentes de facturación y moneda. El contexto de navegación de un documento incluye el resultado real del negocio. No requiere migración.

Validación: modelos de seguimiento y moneda, conteos de versiones, cierre sin documentos, renderizado de ficha, enlaces exactos, estados fiscales incompletos y filtros de visibilidad. La comprobación productiva se hace en lectura, sin alterar oportunidades ni realizar operaciones fiscales.
