# FerchoACT

Portal para que las empresas pequeñas de Honduras suban sus facturas de compra escaneándolas con el celular y su contador prepare la declaración mensual del SAR.

- **Clientes**: toman una foto de la factura y el OCR (Azure Document Intelligence) llena los campos: RTN, CAI, número de factura, montos gravados 15 % / 18 % e ISV.
- **Contador**: ve las facturas de cada empresa ordenadas por mes, las revisa y genera el reporte para el SAR.
- **Registro abierto**: cualquier persona crea su cuenta, registra su empresa e invita a su equipo y a su contador.

## Desarrollo local

Requisitos: Node 24+ y Docker.

```bash
npm install
cp .env.example .env.local
npm run db:up        # Postgres 17 + Azurite (emulador de Azure Blob)
npm run db:migrate
npm run dev
```

Abrir http://localhost:3000.

## Producción (Azure)

Todo vive en el grupo `rg-ferchoact` (suscripción Driem-Sub-Test):

| Recurso | Nombre |
|---|---|
| App (Container Apps, Central US) | `ca-ferchoact` |
| Job de migraciones | `job-migrate-ferchoact` |
| Postgres Flexible Server (B1ms) | `pg-ferchoact-cus`, base `ferchoact` |
| Imágenes | `crferchoact` (ACR) |
| Fotos de facturas | `stferchoact`, contenedor `facturas` |
| Secretos | `kv-ferchoact` (Key Vault), leídos con la identidad `id-ferchoact` |

Para publicar la versión actual (requiere `az login`):

```bash
npm run deploy:azure
```

Compila las imágenes en ACR, corre las migraciones con el job y actualiza la app. Para cambiar un secreto, editarlo en `kv-ferchoact`; la app lo toma en unos 30 minutos o al crear una revisión nueva.

## Stack

Next.js 16 · TypeScript · Tailwind CSS · shadcn/ui · PostgreSQL + Drizzle ORM · Azure Blob Storage · Azure AI Document Intelligence

## Licencia

[MIT](LICENSE)
