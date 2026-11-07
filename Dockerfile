# Imagen de la app para probar en Docker (y base para Azure Container Apps).
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Migraciones y setup de Blob: necesita drizzle-kit/tsx (devDependencies).
FROM deps AS tools
COPY . .

FROM deps AS builder
COPY . .
# Valores de relleno solo para compilar; los reales llegan en runtime.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build \
    AZURE_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
