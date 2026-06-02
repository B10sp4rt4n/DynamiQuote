# Plan de reconstruccion de Cotiza

## Enfoque
Se reconstruye en paralelo al legado para no bloquear operacion actual. La carpeta objetivo es `cotiza-web/`.

## Etapas
1. Fundacion tecnica (esta etapa)
- Crear app Next.js 14 con App Router y TypeScript estricto.
- Definir estructura de carpetas destino (`app`, `components`, `lib`, `prisma`).
- Crear rutas base de auth, dashboard y healthcheck.
- Configurar cliente Prisma singleton y primeros schemas Zod.

2. Datos y seguridad
- Conectar Neon por `DATABASE_URL` y generar Prisma Client.
- Integrar Clerk en middleware y layouts protegidos.
- Implementar contexto de tenant por usuario.
- Asegurar filtro obligatorio por `tenantId` en toda query.

3. Dominio de negocio
- Migrar calculo bidireccional margen/precio desde legacy.
- Implementar consecutivos por tenant: `COT-XXXX`, `PROP-XXXX`, `PKG-XXXX`.
- Modelar Quote, QuoteLine, Package, PackageLine, Proposal y ProposalCondition.
- Implementar copia de lineas de paquete a cotizacion (no referencias vivas).

4. UI funcional
- Construir cotizador editable con optimistic updates.
- Construir modulo de paquetes y propuesta formal.
- Implementar diccionario por tenant para clasificacion 2.
- Integrar dashboard con metricas por tenant.

5. Documentos y calidad
- Exportar PDF de propuestas con React-PDF.
- Importar Excel con SheetJS.
- Agregar pruebas de equivalencia contra logica legacy critica.
- Endurecer performance con indices y profiling de queries.

## Criterios de aceptacion por etapa
- Cada etapa debe compilar sin errores (`npm run lint` + `npm run build`).
- Ninguna consulta puede salir sin `tenantId`.
- El calculo bidireccional debe validarse con casos del legacy.

## Nota
El legacy en Python permanece como fuente de verdad de reglas hasta cerrar equivalencia funcional.
