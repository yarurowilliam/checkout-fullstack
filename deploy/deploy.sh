#!/bin/bash
# Despliegue completo en AWS desde la máquina local.
# Requiere: AWS CLI autenticado, Node 22+ y backend/.env con las variables GATEWAY_*.
#   ./deploy/deploy.sh            -> sube secretos, compila el frontend y despliega el stack
#   ./deploy/deploy.sh api        -> solo redespliega la API en la instancia (git pull + docker)
set -euo pipefail
cd "$(dirname "$0")/.."
export AWS_DEFAULT_REGION=us-east-1
# Git Bash en Windows convierte "/checkout/..." en rutas de Windows; aquí son nombres de SSM.
export MSYS_NO_PATHCONV=1
export AWS_PAGER=""
STACK=CheckoutStack

output() {
  aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

redeploy_api() {
  local id
  id=$(output ApiInstanceId)
  echo "Redesplegando la API en $id..."
  aws ssm send-command --instance-ids "$id" --document-name AWS-RunShellScript \
    --parameters 'commands=["bash /opt/checkout/deploy/redeploy.sh"]' --query Command.CommandId --output text
}

if [[ "${1:-}" == "api" ]]; then
  redeploy_api
  exit 0
fi

# 1. Secretos en SSM Parameter Store (nunca en el repositorio).
set -a; source backend/.env; set +a
put() { aws ssm put-parameter --name "/checkout/$1" --value "$2" --type SecureString --overwrite >/dev/null; }
for key in GATEWAY_URL GATEWAY_PUBLIC_KEY GATEWAY_PRIVATE_KEY GATEWAY_INTEGRITY_SECRET BASE_FEE_IN_CENTS DELIVERY_FEE_IN_CENTS; do
  put "$key" "${!key}"
done
if ! aws ssm get-parameter --name /checkout/DB_PASSWORD >/dev/null 2>&1; then
  put DB_PASSWORD "$(openssl rand -hex 24)"
fi

# 2. Frontend: la API se sirve en el mismo dominio (/api) a través de CloudFront.
(cd frontend && npm ci && VITE_API_URL=/api VITE_GATEWAY_URL="$GATEWAY_URL" VITE_GATEWAY_PUBLIC_KEY="$GATEWAY_PUBLIC_KEY" npm run build)

# 3. Infraestructura.
GATEWAY_ORIGIN=$(node -e "console.log(new URL(process.argv[1]).origin)" "$GATEWAY_URL")
STACK_EXISTS=$(aws cloudformation describe-stacks --stack-name "$STACK" >/dev/null 2>&1 && echo yes || echo no)
(cd infra && npm ci && npx cdk bootstrap && npx cdk deploy --require-approval never -c gatewayOrigin="$GATEWAY_ORIGIN")

# 4. Restringe CORS al dominio de CloudFront y actualiza la API si la instancia ya existía.
APP_URL=$(output AppUrl)
put CORS_ORIGIN "$APP_URL"
if [[ "$STACK_EXISTS" == "yes" ]]; then redeploy_api; fi

echo "Listo: $APP_URL"
