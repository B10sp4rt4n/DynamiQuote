# Series y folios de facturas

Configuración → Facturación: series y folios abre /configuracion/facturacion. Owner y superadmin con sesión Clerk pueden definir prefijo, próximo número, mínimo de dígitos, año y reinicio anual. La vista previa no consume números. Guardar envía la revisión observada y exige coincidencia de empresa visible, sesión y origen. Admin/vendedor no pueden modificar esta configuración. La capacidad fiscal y el destino de Digestor se resuelven en el servidor.

Requiere el cambio correspondiente de B10sp4rt4n/digestor__fiscal, su migración 20261111_01 y FISCAL_NUMBERING_ENABLED=true. El backend devuelve política/ejemplos/año y reserva el folio durante el timbrado. Cotiza no administra un segundo consecutivo ni acepta serie/folio arbitrarios del navegador.

Las conexiones siguen limitadas a los tenants fiscales ya habilitados. No se activan nuevos RFC, cuentas PAC, servicios ni timbrados. Ante backend anterior, función deshabilitada o conexión no disponible, se explica que falta su puesta en servicio y el flujo fiscal previo sigue disponible.

Un guardado fallido o incierto requiere recargar antes de otro envío; nunca se anuncia éxito sin una política confirmada. Las reservas ya asignadas se conservan. Las prefacturas administradas todavía sin número usan la política vigente al timbrar; las anteriores a activar la función mantienen su numeración.

Primera versión para facturas de ingreso; REP, notas de crédito y series de sustitución quedan con su comportamiento existente. La continuidad desde otro sistema requiere que el owner capture correctamente el próximo número. La política no coordina automáticamente emisores externos.

Publicación: migración del backend sobre copia, migración destino, despliegue Digestor, activación de capacidad, despliegue Cotiza y prueba del recorrido autenticado. La configuración inicial de la empresa es una acción explícita del owner. No se modifica automáticamente la numeración real de SynAppsSys.


## Estado de verificación — 11 de noviembre de 2026

Implementación local en feat/invoice-numbering; sin publicación, despliegue ni cambios en facturas reales.

- Cotiza: 1,178 pruebas aprobadas y 92 omitidas; nueve pruebas nuevas de interfaz/API aprobadas. TypeScript, ESLint de módulos nuevos/integración y compilación Next.js correctos.
- Digestor: 97 pruebas fiscales aprobadas con PostgreSQL 18.6 local desechable, incluidas 23 de numeración, concurrencia de reservas/configuración, migración repetible con documentos previos, rollback y validación del XML recibido.
- La suite amplia de Digestor reportó 338 aprobadas, 54 subtests aprobados y 10 fallos de OCR de CSF. Un caso OCR falló igual en el código base 631244c sin esta implementación. No se cambió el lector OCR. La suite completa no se presenta como aprobada.
- Revisión visual pendiente: Chromium local falla al abrir su socket y la descarga alternativa del navegador no entregó un ZIP válido. El ensayo a 1360/390 px está preparado, pero no se presenta como ejecutado con éxito.
- Envío a GitHub y apertura de PRs autorizados por el usuario el 11 de noviembre de 2026. La validación remota y el despliegue se informan por separado; este cambio no aplica migraciones productivas ni configura la numeración real.

## Preparación de liberación

Ensayo del panel real aprobado en Chromium headless 153 a 1360/390 px con datos sintéticos: vistas previa simple/anual, conflicto, guardado y cambio de empresa; cero errores del navegador y cero desbordamientos. La compilación Vercel de la rama 3b1db9f está READY. GitHub Actions sigue en cola; no se declara aprobado.

## PDF de prefactura y folio estimado

En la propuesta, junto a “Ver vista previa”, aparece “Descargar PDF de prefactura” cuando existe una prefactura vigente. Si se edita la captura, se oculta la descarga hasta regenerar; el historial de prefacturas continúa accesible aunque la oportunidad ya no esté ganada. La ruta PDF mantiene permisos por tenant y visibilidad de propuesta, devuelve attachment con ?download=1 y conserva la representación de CFDI timbrado. La vista previa y el PDF incluyen el próximo folio estimado cuando Digestor administra la numeración y aún no hay reserva. El aviso aclara que puede cambiar y se confirma al iniciar el timbrado.

Comprobados 26 casos de flujo/interfaz y API, TypeScript y ESLint. Sin solicitudes de timbrado real.
