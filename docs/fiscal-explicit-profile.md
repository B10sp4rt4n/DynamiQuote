# Captura fiscal explícita: primer perfil

Esta entrega acompaña el núcleo determinista y de transiciones de Digestor Fiscal: https://github.com/B10sp4rt4n/digestor__fiscal/pull/3 . Depende de la cadena CRM y del diagnóstico de cobertura previo, pero no los publica ni fusiona.

## Comportamiento

La pantalla exige revisar clave SAT de producto/servicio y unidad por cada partida. No selecciona una clave genérica automáticamente. El perfil está limitado a MXN, PUE y partidas IVA16 objeto02. Se retiran PPD y forma99 de la captura; moneda distinta de MXN se rechaza también en el servidor sin conversiones implícitas. Las comprobaciones de RFC, régimen, uso y claves son sintácticas: falta validar catálogo y aplicabilidad fiscal completa.

GET entrega una huella de la base de factura (propuesta, moneda, descripciones, cantidades y precios) y los números de partida visibles al usuario autorizado. POST exige esa huella y una correspondencia exacta entre partidas y clasificaciones: no permite duplicados, omisiones ni campos de precio inyectados. Los importes provienen de la propuesta en servidor. Si la propuesta cambió desde la lectura, responde409 y exige recargar. No reemplaza el bloqueo del borrador ni la reserva de timbrado existentes.

Modificar la captura exige regenerar antes de habilitar Timbrar. Durante generación o timbrado la captura se deshabilita. Al reabrir un borrador sin timbrar, se pide revisar las clasificaciones nuevamente y regenerar; no se adivinan ni se recuperan todavía desde un catálogo local. Los PDF ya timbrados siguen derivados del XML original. Cantidad y precio unitario conservan hasta seis decimales en la impresión; importes y totales mantienen centavos.

## Integración y límites

Coordinar el despliegue con Digestor: los clientes antiguos que omiten clasificaciones dejarán de producir borradores listos. El servicio fiscal necesita su migración aditiva en mantenimiento antes de habilitarlo. Este cambio no ejecuta migraciones productivas, no timbra ni hace llamadas reales al PAC. La memoria de actos reside localmente en Digestor, sin conexión externa a Recordia/HotVault.

Pendientes: PPD/REP, pagos/saldos, moneda extranjera y tipo de cambio, cancelaciones/sustitución, egresos, anticipos, parcialidades, otros perfiles de impuestos, validación fiscal completa de catálogos y clasificación persistente por producto. Las aprobaciones y respaldo/recuperación del plan de liberación siguen siendo requisitos antes de activar producción.

## Verificación

Vitest cubre permisos y estados de factura, correspondencia exacta y huella obsoleta, rechazo USD, datos fiscales estrictos y transporte efectivo de claves y precisión a Digestor usando fetch simulado. TypeScript y ESLint revisan los archivos modificados. La suite general mantiene sus omisiones de integración/fixtures cuando no hay base descartable o archivos disponibles; esas omisiones no son validación productiva.
