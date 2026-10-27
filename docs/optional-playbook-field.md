# Guía comercial como campo variable opcional

`quote_playbook_field` declara la capacidad por tenant y queda apagada cuando
no hay habilitación explícita. Superadmin puede administrarla en Configuración
> Tenant > Campo variable: guía comercial, mediante el control auditado existente.

Apagada: el campo no aparece en Nueva cotización y no se envía en el formulario.
El backend conserva su valor por defecto General y rechaza una etiqueta variable
no habilitada, incluso para superadmin. Encendida: permite texto opcional con la
etiqueta Guía comercial; no activa reglas de precio, margen o autorización.

No requiere migración ni habilitar tenants. Los valores históricos se conservan
y las revisiones mantienen el dato original. El cambio no introduce automatismos.
