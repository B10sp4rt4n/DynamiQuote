# Excepción para fecha de cierre comercial

Una oportunidad registrada tarde puede tener un cierre real anterior al alta.
En el detalle de propuesta, al marcar Ganada/Perdida o corregir el cierre, owner,
admin y superadmin pueden activar **Permitir cierre anterior al alta (caso especial)**.
El motivo es obligatorio (10–1000 caracteres), con referencia al estado/fecha leídos.

La API valida la identidad del tenant y el rol nuevamente dentro de la transacción.
Conserva la autorización interna, la exclusión de propuestas ganadas del mismo negocio,
el bloqueo de fila y la protección contra cambios concurrentes. La excepción sólo
elimina el límite inferior de fecha; rechaza días inexistentes y fechas futuras
usando el calendario de Ciudad de México.

El mismo evento de auditoría guarda fecha anterior/nueva, motivo, usuario que autoriza,
rol, referencia original del alta y momento real del registro. El motivo se muestra
en el historial administrativo y se mantiene reservado en la proyección para vendedores.
Revenue y margen se asignan al mes del cierre elegido; no se reescribe la fecha de alta.

La fecha de pago, CFDI y REP no cambian. El pago del 29 de octubre comunicado por
Salvador no se ha aplicado como cierre ni como pago de una factura mediante este cambio.
No requiere migraciones ni servicios nuevos.

Validación: pruebas de transacción con persistencia simulada, contrato API, calendario,
y UI con rol normal/administrativo, opt-in, motivo y envío de la referencia concurrente.
