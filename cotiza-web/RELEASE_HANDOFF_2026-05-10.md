# Release Handoff 2026-05-10

## Estado

- Lint: OK
- Tests: OK
- Production build: OK
- Warning de Next.js por workspace root: resuelto
- Runtime smoke en produccion: OK
- Walkthrough funcional del slice interno en bootstrap: OK

## Cambio clave reciente

- El warning de Next.js no provenia de `next.config.ts`.
- La causa raiz fue la coexistencia de dos lockfiles en el workspace:
  - `package-lock.json` en raiz
  - `cotiza-web/package-lock.json` anidado
- La correccion aplicada fue eliminar `cotiza-web/package-lock.json` y volver a validar build.

## Validaciones ejecutadas

1. `npm run lint`
2. `npm test`
3. `npm run build`
4. `npm start` en puerto alterno por conflicto en `3000`
5. Smoke HTTP sobre:
   - `/`
   - `/api/health`
   - `/propuestas`
   - `/cotizaciones`
   - `/configuracion`
6. Walkthrough funcional en modo bootstrap recompilado sin Clerk sobre tenant `dynamiquote`

## Resultado del walkthrough interno

- `cotizaciones`: carga lista guardada, editor de lineas y accion de crear cotizacion.
- `propuestas`: carga filtros, tabla, propuesta activa, aprobaciones formales y exportaciones.
- `configuracion`: carga usuarios y politica de margen para el tenant.

## Limitacion conocida

- No se automatizo una sesion real de Clerk desde terminal.
- El entorno si tiene Clerk operativo, pero el flujo de login efectivo sigue dependiendo de redireccion browser-first.
- Se confirmo que las rutas protegidas redirigen correctamente a Clerk cuando no hay sesion.

## Riesgo residual

- Queda pendiente solo una verificacion manual autenticada en navegador si se quiere cierre go/no-go de UX completa con Clerk.