# GitHub Copilot Instructions — Cotiza

## Contexto del Proyecto
Cotiza es un SaaS multicliente y multiusuario de cotización y
generación de propuestas comerciales. Nació como un prototipo
en Streamlit llamado DynamiQuote y está siendo reescrito en
Next.js 14 manteniendo toda la lógica de negocio validada.

## Stack Nuevo (destino)
- Framework: Next.js 14 con App Router
- Base de datos: Neon PostgreSQL (ya existente y con datos)
- ORM: Prisma
- Auth: Clerk (multiusuario + multi-tenant)
- UI: shadcn/ui + Tailwind CSS
- PDF: React-PDF
- Excel: SheetJS
- Gráficas: Recharts
- Deploy: Vercel

## Stack Anterior (origen — NO replicar patrones)
- Frontend/Backend: Streamlit (Python)
- BD principal: Neon PostgreSQL
- BD legacy: SQLite local (dynamiquote.db, quotes_mvp.db) — IGNORAR
- El código Python es referencia de lógica, no de arquitectura

## Archivos de Referencia de Lógica de Negocio
Cuando necesites entender reglas de negocio, consulta estos
archivos del repo legacy:
- `database.py` — modelo de datos y queries
- `aup_engine.py` — motor de cálculo de márgenes y precios
- `src/domain/profitability_calculator.py` — cálculos de rentabilidad
- `formal_proposal_generator.py` — flujo de propuestas formales
- `excel_import.py` — lógica de importación desde Excel
- `pdf_generator.py` — generación de documentos
- `templates/` — plantillas HTML/CSS de referencia visual

## Modelo de Datos — Entidades Principales
- Tenant: empresa cliente del sistema (multi-tenant)
- User: usuario por tenant (via Clerk)
- EmisorProfile: perfiles de membrete emisor sin límite por tenant
- Dictionary: clasificaciones granulares por industria/tenant
- Package (PKG-XXXX): plantillas de líneas precargadas editables
- PackageLine: líneas que componen cada paquete
- Quote (COT-XXXX): cotización con cabecera y líneas
- QuoteLine: nodos de cotización (SKU, descripción, cantidad,
  costo, precio, margen, clasificación1, clasificación2)
- Proposal (PROP-XXXX): propuesta formal 1 a 1 con cotización
- ProposalCondition: condiciones comerciales de la propuesta

## Reglas de Negocio Críticas
1. Cálculo bidireccional: si se ingresa margen → calcular precio;
   si se ingresa precio → calcular margen. Nunca romper esta lógica.
2. Multi-tenant estricto: TODA query debe filtrar por tenantId.
   Nunca exponer datos entre tenants.
3. Consecutivos automáticos por tenant: COT-XXXX, PROP-XXXX, PKG-XXXX
4. Paquetes: al insertarse en cotización, sus líneas se COPIAN
   y son editables. No son referencias vivas.
5. Propuestas tienen estados: Borrador → Enviada → En revisión
   → Aprobada / Rechazada / Vencida
6. Cotizaciones NO tienen estados, son documentos de trabajo.

## Clasificaciones
- Clasificación 1: Producto / Servicio (universal)
- Clasificación 2: configurable por tenant. Default limpieza
  industrial: Equipo, Implementación, Mantenimiento, Refacción,
  Capacitación, Otro

## Convenciones de Código
- TypeScript estricto en todo el proyecto, sin any
- Nombres de archivos: kebab-case
- Componentes React: PascalCase
- Funciones y variables: camelCase
- Tablas Prisma: snake_case
- Toda lógica de BD va en /lib/db — nunca en componentes
- Toda validación usa Zod
- No usar useEffect para fetching — usar Server Components o
  React Query
- Comentarios en español, código en inglés

## Lo que NO debes hacer
- No replicar patrones de Streamlit (re-renders globales,
  estado en sesión, scripts lineales)
- No usar SQLite ni archivos .db locales
- No crear archivos migrate_*.py ni scripts de migración sueltos
- No mezclar lógica de UI con lógica de base de datos
- No ignorar el tenantId en ninguna query
- No hardcodear clasificaciones — siempre vienen del diccionario
  del tenant

## Estructura de Carpetas
app/
  (auth)/           # Login, registro via Clerk
  (dashboard)/      # App principal protegida
    cotizaciones/   # COT-XXXX
    propuestas/     # PROP-XXXX
    paquetes/       # PKG-XXXX
    configuracion/  # Perfiles emisor, diccionarios, usuarios
  api/              # API routes de Next.js
components/
  ui/               # shadcn/ui y componentes base
  cotizador/        # Componentes del cotizador
  propuestas/       # Componentes de propuestas
lib/
  db/               # Prisma client y queries
  validations/      # Zod schemas
  utils/            # Helpers generales
prisma/
  schema.prisma     # Schema único, no migraciones sueltas

## Contexto de Performance
El sistema anterior era lento por:
- Streamlit re-ejecutando scripts completos en cada interacción
- Conexiones a Neon sin connection pooling
- Queries no optimizadas sin índices
En Next.js usar siempre:
- Prisma con connection pooling via Neon serverless driver
- Server Components para fetching inicial
- Optimistic updates en el cotizador para sensación de velocidad
- Índices en tenant_id, quote_id, proposal_id en todas las tablas

## Objetivo Final
Sistema SaaS universal de cotización — arranca con limpieza
industrial como caso de uso pero el diccionario es intercambiable
por cualquier industria sin cambios de código. Hazlo en una nueva rama
