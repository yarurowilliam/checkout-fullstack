#!/bin/bash
# Se ejecuta en la instancia: al arrancar (user data) y en cada redespliegue (SSM Run Command).
set -euo pipefail
source /etc/checkout.env
export AWS_DEFAULT_REGION=us-east-1

cd /opt/checkout
git fetch --quiet origin "$BRANCH"
git reset --hard "origin/$BRANCH"

# Variables de entorno desde SSM Parameter Store (/checkout/NOMBRE -> NOMBRE=valor).
aws ssm get-parameters-by-path --path /checkout/ --with-decryption \
  --query "Parameters[].[Name,Value]" --output text |
  while read -r name value; do echo "${name##*/}=${value}"; done > deploy/.env
chmod 600 deploy/.env

docker build -t checkout-api:latest backend
docker compose -f deploy/docker-compose.prod.yml up -d --remove-orphans
docker image prune -f
