#!/usr/bin/env bash
# Publica la versión actual en Azure Container Apps:
#   1. compila las imágenes en ACR (runner = app, tools = migraciones)
#   2. corre las migraciones con el job y espera a que terminen
#   3. actualiza la app y verifica que responda
#
#   npm run deploy:azure            # etiqueta = commit actual
#   TAG=mi-etiqueta npm run deploy:azure
#
# Requiere `az login` en la suscripción Driem-Sub-Test. Los secretos viven en
# kv-ferchoact; la app y el job los leen con la identidad id-ferchoact.
set -euo pipefail

RG=rg-ferchoact
ACR=crferchoact
APP=ca-ferchoact
JOB=job-migrate-ferchoact
REGISTRY="$ACR.azurecr.io"

cd "$(dirname "$0")/.."
if [ -z "${TAG:-}" ]; then
  TAG=$(git rev-parse --short HEAD)
  [ -n "$(git status --porcelain)" ] && TAG="$TAG-dirty"
fi

echo "== Compilando imágenes $TAG en $ACR"
az acr build -r $ACR -t ferchoact:$TAG --target runner . -o none
az acr build -r $ACR -t ferchoact-tools:$TAG --target tools . -o none

echo "== Migraciones"
az containerapp job update -g $RG -n $JOB --image $REGISTRY/ferchoact-tools:$TAG -o none
EXEC=$(az containerapp job start -g $RG -n $JOB --query name -o tsv)
while :; do
  STATUS=$(az containerapp job execution show -g $RG -n $JOB --job-execution-name "$EXEC" --query properties.status -o tsv)
  case "$STATUS" in
    Succeeded) break ;;
    Failed|Stopped|Degraded)
      echo "Las migraciones fallaron ($EXEC: $STATUS). Revisar los logs del job en el portal." >&2
      exit 1 ;;
  esac
  sleep 10
done

echo "== Actualizando $APP"
az containerapp update -g $RG -n $APP --image $REGISTRY/ferchoact:$TAG -o none
URL="https://$(az containerapp show -g $RG -n $APP --query properties.configuration.ingress.fqdn -o tsv)"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 60 "$URL/ingresar")
echo "$URL/ingresar → $CODE"
[ "$CODE" = "200" ]
