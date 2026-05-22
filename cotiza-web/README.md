# Cotiza Web

Nueva base de la app Cotiza en Next.js 14+ con App Router, enfocada a migrar la logica validada del legado Streamlit.

## Estado actual
- Etapa 1 iniciada: estructura base de rutas, dashboard, API healthcheck y capas `lib/`.
- Prisma 7 y Neon conectados con `@prisma/adapter-pg` y pool compartido.
- Clerk integrado de forma condicional: provider, middleware y pantallas reales de auth.
- Plan de reconstruccion por fases en `RECONSTRUCCION_COTIZA.md`.

## Comandos
```bash
npm install
npm run dev
```

## Variables de entorno clave
- `DATABASE_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `DEFAULT_TENANT_SLUG` solo como fallback cuando Clerk aun no esta configurado

## Multi-tenant con Clerk
- Cuando Clerk esta activo, el tenant se resuelve desde `tenantId` o `tenantSlug` en metadata.
- Como fallback temporal tambien se acepta `org_slug` para mapear una organizacion de Clerk al `slug` del tenant.
- Si no hay metadata de tenant, las rutas protegidas no cargan datos.

## Rutas iniciales
- `/`
- `/sign-in`
- `/sign-up`
- `/cotizaciones`
- `/propuestas`
- `/paquetes`
- `/configuracion`
- `/api/health`

## Siguientes pasos inmediatos
1. Modelar dominio Cotiza completo sobre Prisma.
2. Migrar motor bidireccional de margen/precio.
3. Implementar UI funcional de cotizaciones, paquetes y propuestas.
4. Conectar Clerk con alta/sincronizacion de usuarios internos por tenant.
