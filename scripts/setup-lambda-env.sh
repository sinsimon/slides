#!/bin/bash
# Script per configurare le variabili d'ambiente per tutte le Lambda functions
# Legge le variabili dal file .env locale e le applica a tutte le Lambda

set -e

AWS_REGION=${AWS_REGION:-eu-central-1}
AWS_S3_BUCKET=${AWS_S3_BUCKET:-simo-slides}

# Lista di tutte le Lambda functions
LAMBDA_FUNCTIONS=(
  "stripe-new-subscriptions"
  "stripe-cancellations"
  "monday-enterprise-accounts"
  "active-campaign-contacts"
  "vapor-tenants"
  "vapor-users-funnel"
)

echo "🔧 Configurazione Variabili d'Ambiente Lambda"
echo "=============================================="
echo ""

# Verifica che .env esista
if [ ! -f ".env" ]; then
  echo "❌ Errore: file .env non trovato"
  echo "   Crea un file .env con tutte le variabili necessarie"
  exit 1
fi

# Carica le variabili dal .env
source .env

# Prepara le variabili d'ambiente per AWS Lambda
# Formato: Key1=Value1,Key2=Value2,...
ENV_VARS="AWS_S3_BUCKET=${AWS_S3_BUCKET}"

# Aggiungi variabili dal .env se presenti
[ -n "$STRIPE_API_KEY" ] && ENV_VARS="${ENV_VARS},STRIPE_API_KEY=${STRIPE_API_KEY}"
[ -n "$MONDAY_API_KEY" ] && ENV_VARS="${ENV_VARS},MONDAY_API_KEY=${MONDAY_API_KEY}"
[ -n "$MONDAY_BOARD_ID" ] && ENV_VARS="${ENV_VARS},MONDAY_BOARD_ID=${MONDAY_BOARD_ID}"
[ -n "$ACTIVE_CAMPAIGN_API_URL" ] && ENV_VARS="${ENV_VARS},ACTIVE_CAMPAIGN_API_URL=${ACTIVE_CAMPAIGN_API_URL}"
[ -n "$ACTIVE_CAMPAIGN_API_KEY" ] && ENV_VARS="${ENV_VARS},ACTIVE_CAMPAIGN_API_KEY=${ACTIVE_CAMPAIGN_API_KEY}"
[ -n "$VAPOR_RDS_HOST" ] && ENV_VARS="${ENV_VARS},VAPOR_RDS_HOST=${VAPOR_RDS_HOST}"
[ -n "$VAPOR_RDS_PORT" ] && ENV_VARS="${ENV_VARS},VAPOR_RDS_PORT=${VAPOR_RDS_PORT}"
[ -n "$VAPOR_RDS_USER" ] && ENV_VARS="${ENV_VARS},VAPOR_RDS_USER=${VAPOR_RDS_USER}"
[ -n "$VAPOR_RDS_PASSWORD" ] && ENV_VARS="${ENV_VARS},VAPOR_RDS_PASSWORD=${VAPOR_RDS_PASSWORD}"
[ -n "$VAPOR_RDS_DATABASE" ] && ENV_VARS="${ENV_VARS},VAPOR_RDS_DATABASE=${VAPOR_RDS_DATABASE}"
[ -n "$VAPOR_RDS_SSL" ] && ENV_VARS="${ENV_VARS},VAPOR_RDS_SSL=${VAPOR_RDS_SSL}"
[ -n "$VAPOR_RDS_SSL_REJECT_UNAUTHORIZED" ] && ENV_VARS="${ENV_VARS},VAPOR_RDS_SSL_REJECT_UNAUTHORIZED=${VAPOR_RDS_SSL_REJECT_UNAUTHORIZED}"

echo "📋 Variabili da configurare:"
echo "   AWS_S3_BUCKET=${AWS_S3_BUCKET}"
[ -n "$STRIPE_API_KEY" ] && echo "   STRIPE_API_KEY=*** (presente)"
[ -n "$MONDAY_API_KEY" ] && echo "   MONDAY_API_KEY=*** (presente)"
[ -n "$ACTIVE_CAMPAIGN_API_URL" ] && echo "   ACTIVE_CAMPAIGN_API_URL=*** (presente)"
[ -n "$VAPOR_RDS_HOST" ] && echo "   VAPOR_RDS_HOST=*** (presente)"
echo ""

# Applica a tutte le Lambda
for function_name in "${LAMBDA_FUNCTIONS[@]}"; do
  echo "🔧 Configurando ${function_name}..."
  
  # Verifica che la funzione esista
  if aws lambda get-function --function-name "$function_name" --region "$AWS_REGION" &>/dev/null; then
    aws lambda update-function-configuration \
      --function-name "$function_name" \
      --environment "Variables={${ENV_VARS}}" \
      --region "$AWS_REGION" > /dev/null
    
    echo "   ✅ ${function_name} configurata"
  else
    echo "   ⚠️  ${function_name} non trovata (verrà configurata al prossimo deploy)"
  fi
done

echo ""
echo "✅ Configurazione completata!"
echo ""
echo "💡 Nota: Le variabili sensibili (password, API keys) sono ora nelle Lambda."
echo "   Per maggiore sicurezza, considera di usare AWS Secrets Manager in futuro."
