---
name: backend
description: Reglas de backend del portal de facturas (Next.js server actions/route handlers, Postgres con Drizzle, multi-empresa, almacenamiento de imágenes, OCR con Azure Document Intelligence, reporte SAR). Usar antes de tocar esquema de base de datos, autorización, endpoints, OCR o generación de reportes.
---

# Backend del portal de facturas

## Stack

- Next.js (App Router, TypeScript estricto). Las mutaciones desde la UI se hacen con **server actions**. Los **route handlers** (`app/api/**/route.ts`) quedan solo para lo que no es UI: subida de archivos, webhooks y descargas de reportes.
- Postgres: en local corre en Docker (`docker compose`) y en producción en Azure Database for PostgreSQL Flexible Server. La única diferencia entre los dos es `DATABASE_URL`; no debe haber código que dependa del entorno.
- ORM: Drizzle (`drizzle-orm` + `drizzle-kit`). El esquema vive en `db/schema/*.ts` y las migraciones se generan con drizzle-kit y se versionan. **No editar a mano una migración ya aplicada.**
- Autenticación propia (patrón de la guía de Next): email + contraseña con hash argon2 (`lib/auth/password.ts`) y sesiones en la tabla `sessions`. La cookie lleva un token aleatorio y la base guarda solo su SHA-256 (`lib/auth/session.ts`). `src/proxy.ts`, que reemplaza a middleware desde Next 16, hace solo un chequeo optimista de que exista la cookie; la verificación real es `getCurrentUser()`/`requireUser()`. Más adelante se podrá agregar Microsoft Entra.
- `cacheComponents` está activo: todo lo que lea `cookies()`/la sesión debe ir dentro de un `<Suspense>`, incluso en layouts. Nunca hacer `await` de la sesión en el nivel superior de un layout. Ver `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`.
- Archivos: Azure Blob Storage. En local se usa Azurite en Docker, así el mismo SDK (`@azure/storage-blob`) sirve en los dos entornos.
- OCR: Azure AI Document Intelligence (`@azure-rest/ai-document-intelligence`).
- Validación: `zod` en cada frontera (server actions, route handlers, respuesta del OCR, variables de entorno en `lib/env.ts`).

## Modelo de dominio y multi-empresa

Entidades principales: `users`, `companies` (RTN único), `company_members` (user ↔ company con rol `owner` | `member`), `accountant_clients` (contador ↔ company), `invoices`, `invoice_files`, `tax_periods` (empresa + año-mes + estado), `sar_reports` y `audit_log`.

Roles:
- **member**: sube facturas de su empresa y ve las suyas.
- **owner**: además invita y gestiona miembros, y ve todas las facturas de la empresa.
- **accountant**: ve y edita las facturas de las empresas que lo vincularon, cierra períodos y genera reportes. Un contador atiende a muchas empresas.

Registro: una persona nueva crea su usuario y luego crea su empresa (queda como `owner`) o acepta una invitación. El vínculo con el contador nace de una invitación que el owner envía al email del contador.

**Regla de aislamiento**: toda consulta de datos de una empresa pasa por `requireCompanyAccess(session, companyId, permiso)` en `lib/auth/access.ts` antes de tocar la base, y filtra por `company_id`. Nunca confiar en un `companyId` que llega del cliente sin esa verificación. Agregar un test de autorización por cada nueva acción.

## Factura (campos SAR)

Los campos se basan en el Reglamento del Régimen de Facturación del SAR:
- `rtn_emisor` (14 dígitos), `razon_social_emisor`, `cai` (formato `XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XX`), `numero_factura` (`000-000-00-00000000`), `rango_autorizado_desde/hasta`, `fecha_limite_emision`, `fecha_emision`, `rtn_comprador`.
- Montos: `importe_exento`, `importe_exonerado`, `importe_gravado_15`, `importe_gravado_18`, `isv_15`, `isv_18` y `total`.
- Dinero: siempre `numeric(14,2)` en Postgres y `string`/decimal en TS (por ejemplo `decimal.js`). **Nunca `float`/`number` para montos.**
- Período: se deriva de `fecha_emision` en `America/Tegucigalpa`. El contador puede reasignar el período y queda registrado en el audit log.
- Duplicados: índice único `(company_id, rtn_emisor, numero_factura)`. Si llega un duplicado se avisa al usuario y no se crea un segundo registro.
- Estado: `processing → needs_review → validated → declared`, más `rejected`. Una factura `declared` es inmutable y solo puede corregirla el contador con una razón, que queda en el audit log.

## Flujo de subida y OCR

1. El cliente pide al servidor una SAS URL de escritura de corta duración (≤ 10 min, un solo blob) y sube la imagen directo a Blob. Así el archivo no pasa por la función de Next.js.
2. El cliente confirma la subida y el servidor crea la `invoice` en `processing` junto con su `invoice_file`.
3. El servidor llama a Document Intelligence: empezar con `prebuilt-invoice`, que no conoce los campos hondureños, y complementar con la salida `prebuilt-layout`/`content` y regex para CAI, RTN y número de factura. Cuando haya suficientes facturas reales, entrenar un modelo custom y cambiar solo el adaptador.
4. Toda la lógica de OCR vive detrás de una interfaz en `lib/ocr/` (`extractInvoice(fileUrl) → { fields, confidences }`). Así se puede mockear en tests y cambiar de modelo sin tocar el resto.
5. Se guardan los valores extraídos **y** la confianza por campo, y la factura pasa a `needs_review`. Si el OCR falla, la factura igual pasa a `needs_review` con los campos vacíos: nunca se pierde la subida.
6. La operación de OCR es larga (LRO). No debe bloquear la respuesta HTTP del usuario: se procesa en segundo plano y la UI consulta el estado.

## Reporte SAR

- Se genera por empresa y período. Solo se puede generar si todas las facturas del período están en `validated`, y al hacerlo las facturas pasan a `declared` y el período a `closed`.
- La salida es el libro de compras del mes en el formato de importación que pide el SAR (DMC / plantilla vigente), más un resumen de ISV. **No inventar el layout del archivo**: tomarlo de la plantilla oficial que entregue el contador, guardarla como fixture en `lib/sar/__fixtures__/` y probar el generador contra ella.
- Cada reporte generado se guarda (archivo en Blob + fila en `sar_reports`) y no se sobrescribe. Para corregir se genera una versión nueva.

## Convenciones

- Las server actions devuelven `{ ok: true, data } | { ok: false, error: { code, message } }` y no lanzan excepciones hacia la UI. El `message` está en español y es apto para el usuario.
- Los secretos (`DATABASE_URL`, `AZURE_STORAGE_*`, `AZURE_DI_ENDPOINT`, `AZURE_DI_KEY`, `AUTH_SECRET`) se leen solo vía `lib/env.ts`. `.env.example` se mantiene al día y `.env.local` nunca se versiona.
- Las imágenes de facturas son datos fiscales: los blobs son privados y se leen con SAS de lectura de corta duración, emitida después de `requireCompanyAccess`.
- Tests: Vitest. La autorización y el generador SAR se prueban contra el Postgres de Docker, y el OCR siempre con mock.
