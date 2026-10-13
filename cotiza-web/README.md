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

## Identidad y acceso con Clerk
- Cada sesión se vincula exclusivamente por `Clerk userId = app_users.user_id`.
- El usuario local debe existir y estar activo. Su rol y tenant se leen de `app_users`.
- No se reconcilian cuentas por nombre, alias ni metadata durante una petición.
- El alta administrativa y el webhook firmado de Clerk establecen la vinculación por ID.
- Usuarios desconocidos, desactivados o con tenant inactivo no reciben contexto autorizado.
- Solo un superadmin activo y vinculado puede seleccionar otro tenant con `tenant_override_slug`.
- Si falta cualquiera de las credenciales de Clerk, se deniega acceso fuera de `NODE_ENV=development`.
- El modo bootstrap anónimo y las cookies de sesión sintética son exclusivos del desarrollo local.

### Preparación antes de desplegar este cambio
Verificar que las cuentas existentes, especialmente Owner y Superadmin, tengan en `app_users.user_id`
su ID real de Clerk, estén activas y tengan la membresía correcta. Las cuentas heredadas que dependían
de coincidencias por nombre/alias requieren vinculación administrativa explícita antes del despliegue.
No se actualizan IDs ni roles automáticamente durante el inicio de sesión.

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
