# Validación del recorrido comercial

Validación del 7 de noviembre de 2026 con datos sintéticos y PostgreSQL local desechable. No se crean negocios productivos, no se envían correos ni se emiten facturas.

## Resultado y corrección

Se comprobó declaración explícita → folio OPP-0001 → cotización v1 → propuesta → revisión v2 → autorización → cierre con fecha → ficha y KPI mensual. La carga inicial permanece en v1. Reintentar la declaración, la generación de propuesta o el mismo cierre conserva la identidad y no duplica el resultado.

El caso negativo reprodujo una falla: era posible marcar dos propuestas del mismo negocio como ganadas y sumar ambas en revenue. Ahora se serializa el registro de ganadas dentro del tenant y, antes de escribir el resultado, se busca otra propuesta ganada de la misma oportunidad, familia de cotización o conjunto declarado de alternativas. La API devuelve HTTP 409 con una explicación si ya existe una ganadora. No se modifica la propuesta previamente ganada.

Para cambiar la propuesta aceptada se debe retirar explícitamente el resultado anterior y cerrar la propuesta correcta. Ambos actos conservan su auditoría. Se permite una venta de otro negocio para el mismo cliente. Los cierres simultáneos de dos alternativas terminan con una sola ganadora.

## Evidencia reproducible

- 534 pruebas generales aprobadas; 47 pruebas optativas omitidas en esa ejecución. La prueba heredada `validate-quote-lifecycle.e2e.test.ts`, que depende de una base externa, se excluye de la ejecución general.
- 29 pruebas de integración en PostgreSQL nativo, incluyendo fechas, correcciones, reapertura, aislamiento, versiones, alternativas y concurrencia.
- Recorrido HTTP real en Next.js local: creación, edición, propuesta original, nueva revisión, autorización de ambas, cierre de la revisión aceptada, rechazo del cierre duplicado con 409 y render de la página KPI con revenue de 1,100.00. Actor técnico de bootstrap local, sin identidad Clerk de producción.
- TypeScript y ESLint sin errores; permanece una advertencia anterior de variable no utilizada en `proposals.ts`.

El runner `scripts/check_explicit_opportunity.mjs` crea su propia base vacía y no reutiliza la conexión productiva. Con `COTIZA_HTTP_CHECK=1` también levanta y cierra Next.js local. `EMBEDDED_POSTGRES_MODULE` apunta al módulo temporal `embedded-postgres` instalado fuera del repositorio.

## Límites

Este control impide cierres duplicados nuevos. No deduplica ni modifica decisiones históricas ya registradas. No cambia el significado de los KPI de actividad (monto propuesto y autorizado): esas métricas siguen describiendo documentos, mientras el ingreso requiere una ganada.

La validación visual en teléfono sigue pendiente: el navegador disponible en esta sesión no expone emulación ni cambio de viewport. Las pruebas HTTP y de base no sustituyen una revisión móvil ni una prueba completa con inicio de sesión Clerk real.
