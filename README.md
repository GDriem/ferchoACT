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

## Stack

Next.js 16 · TypeScript · Tailwind CSS · shadcn/ui · PostgreSQL + Drizzle ORM · Azure Blob Storage · Azure AI Document Intelligence

## Licencia

[MIT](LICENSE)
