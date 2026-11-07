# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Portal web (PWA) para un contador en Honduras y sus clientes:
- **Clientes** (empresas pequeñas, p. ej. 4 personas): cada miembro escanea sus facturas con la cámara del celular, el OCR extrae los datos y la persona los confirma.
- **Contador**: ve las facturas por empresa y por mes, las revisa y genera el reporte para el SAR (Servicio de Administración de Rentas).
- **Registro abierto**: cualquier persona nueva puede crear su usuario, registrar su empresa (RTN) e invitar a su equipo y a su contador.

El usuario se comunica en español. La interfaz y los mensajes van en español de Honduras.

## Reglas del repositorio

- **Commits sin coautoría**: no agregar `Co-Authored-By: Claude …` ni ninguna atribución a Claude en los mensajes de commit ni en los PR.
- Next.js 16 tiene cambios que rompen compatibilidad con versiones anteriores (ver `AGENTS.md`). Antes de usar una API de Next, consultar `node_modules/next/dist/docs/`.

## Comandos

```bash
cp .env.example .env.local   # una sola vez
npm run db:up                # Postgres + Azurite en Docker
npm run db:migrate           # aplicar migraciones (drizzle/)
npm run storage:setup        # contenedor de Blob + CORS para subir desde el navegador
npm run dev                  # http://localhost:3000

npm run lint
npm run typecheck            # next typegen + tsc (los tipos LayoutProps/PageProps los genera Next)
npm test                     # vitest (crea y migra la base <db>_test)
npx vitest run src/lib/validation/rtn.test.ts   # un solo archivo
npx vitest run -t "valida 14 dígitos"          # un solo test por nombre
npm run build

npm run db:generate -- --name <cambio>   # después de editar src/db/schema/*
npm run db:studio
```

## Arquitectura

- **Stack**: Next.js 16 (App Router, `cacheComponents` activo) + Tailwind v4 + shadcn/ui (sobre Base UI: usa la prop `render` en lugar de `asChild`; para links con estilo de botón usar `buttonVariants`). Postgres con Drizzle (`casing: "snake_case"`), Azure Blob (Azurite en local) y Azure Document Intelligence para el OCR.
- **Postgres**: en local corre en Docker; en producción será Azure Database for PostgreSQL. Solo cambia `DATABASE_URL`.
- **Rutas**: las páginas públicas de auth están en `src/app/(auth)/` (`/ingresar`, `/registro`) y la app autenticada bajo `/app`. Las mutaciones son server actions en `src/app/actions/` y devuelven `FormState` para `useActionState`.
- **Autenticación**: sesiones propias en la base (`src/lib/auth/session.ts`). `src/proxy.ts` solo hace un chequeo optimista de la cookie.
- **Autorización por empresa**: `requireCompanyAccess(companyId, permiso)` en `src/lib/auth/access.ts` es el único punto de entrada para leer o escribir datos de una empresa. Roles: `owner`/`member` (en `company_members`) y contador (`users.is_accountant` + `accountant_clients`).
- **Esquema**: está en `src/db/schema/`. Las facturas guardan los campos SAR, los montos como `numeric(14,2)` y la confianza del OCR por campo. Los duplicados se bloquean por `(company_id, rtn_emisor, numero_factura)`.

## Skills del proyecto

Antes de trabajar, cargar la skill que corresponda:
- `ui-ux`: pantallas, componentes, flujo de cámara y vistas del contador.
- `backend`: esquema, multi-empresa/autorización, OCR, reporte SAR.
