# Experiencia CRM piloto sobre Cotiza actual

## Alcance

Entrada `/crm` con pestañas «Mi día», «Oportunidades» y «Clientes y seguimiento». Consume los mismos clientes, oportunidades y tareas de Cotiza, y reutiliza ClientShell, PipelineDashboard y PendingTasksPanel. No crea entidades paralelas ni modifica la cotización. No agrega campos obligatorios ni servicios.

El acceso requiere sesión identificada, superadmin y capacidad `crm_workspace_pilot` activa en el tenant actual. El menú aplica el mismo filtro; el servidor vuelve a comprobarlo antes de consultar datos. La activación se registra por el mecanismo actual de capacidades y es reversible. Esta primera activación se solicita para SynAppsSys; no se amplía a vendedores ni propietarios.

## Límites

No fusiona ni sustituye PR28/33. No incorpora las migraciones multitenant, cambios fiscales, AUP/Recordia nuevos, conversación por chat ni CRM Agent. El corte completo del CRM mantiene sus prerrequisitos de recuperación, escritores, preflight y compatibilidad fiscal. Las acciones de clientes, tareas y oportunidades son las ya disponibles en producción; no se añade otro endpoint de escritura.

«Mi día» presenta cuentas activas, oportunidades abiertas, búsqueda de cuenta y pendientes existentes. No calcula revenue nuevo ni infiere etapas de negociación: los estados se derivan de las propuestas por el servicio actual. Para registrar próximo paso se abre Clientes y seguimiento y se usa «Tarea». No envía mensajes ni crea seguimientos automáticos.

## Recorrido de piloto

1. Superadmin activa la capacidad para SynAppsSys en Configuración > Tenant.
2. Abre CRM · Piloto > Mi día, busca HL Innovación y revisa su ficha e historial.
3. Consulta Oportunidades; verifica el desenlace derivado actual.
4. Abre Registrar próximo paso > busca la cuenta > Tarea. La verificación remota abre el formulario sin guardar tareas ficticias ni enviar correos.
5. Vuelve a Cotizar y confirma que el flujo habitual y la comparación piloto se conservan.

Desactivar la capacidad retira el menú y devuelve 404 para `/crm`, sin borrar información comercial.
