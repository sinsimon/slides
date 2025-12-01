#!/bin/bash
set -e

# Leggi le variabili d'ambiente
AWS_REGION=${AWS_REGION:-eu-central-1}
AWS_S3_BUCKET=${AWS_S3_BUCKET}
AWS_LAMBDA_ROLE_ARN=${AWS_LAMBDA_ROLE_ARN}
GROUP_KEY=${GROUP_KEY}
GROUP_SECRET=${GROUP_SECRET}
SECRETS_ENV=${SECRETS_ENV:-production}

if [ -z "$AWS_S3_BUCKET" ]; then
  echo "Error: AWS_S3_BUCKET environment variable is required"
  exit 1
fi

if [ -z "$AWS_LAMBDA_ROLE_ARN" ]; then
  echo "Error: AWS_LAMBDA_ROLE_ARN environment variable is required"
  exit 1
fi

if [ -z "$GROUP_KEY" ] || [ -z "$GROUP_SECRET" ]; then
  echo "Warning: GROUP_KEY or GROUP_SECRET not set. Lambdas might fail to fetch secrets."
fi

# Ottieni l'account ID AWS
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "📋 AWS Account ID: $AWS_ACCOUNT_ID"

# Leggi la configurazione cron
CRON_CONFIG="lambda-cron-config.json"
if [ ! -f "$CRON_CONFIG" ]; then
  echo "Error: $CRON_CONFIG not found"
  exit 1
fi

# Installa esbuild per bundle TypeScript
npm install --save-dev esbuild @types/node

# Crea directory per i package
mkdir -p lambda-packages

# Funzione per deployare una Lambda
deploy_lambda() {
  local poller_name=$1
  local schedule=$2
  local function_name=$(echo "$poller_name" | tr ':' '-')
  local package_dir="lambda-packages/$function_name"
  
  echo "📦 Packaging $function_name..."
  
  # Crea directory del package
  mkdir -p "$package_dir"
  
  # Compila TypeScript in un unico file JS usando esbuild
  # Includiamo dotenv e aws-sdk come external se necessario, ma qui vogliamo tutto nel bundle
  # tranne aws-sdk v3 che è già nel runtime lambda (ma parzialmente, meglio includere per sicurezza se usiamo client specifici)
  # Per semplicità bundliamo tutto.
  
  npx esbuild src/data/avacy/pollers/lambda-handler.ts \
    --bundle \
    --platform=node \
    --target=node18 \
    --outfile="$package_dir/index.js" \
    --format=cjs \
    --external:@aws-sdk/* 

  # Crea zip con solo il file compilato
  cd "$package_dir"
  zip -r "../${function_name}.zip" index.js -q
  cd - > /dev/null
  
  echo "✅ Packaged $function_name"
  
  # Verifica se la funzione esiste
  if aws lambda get-function --function-name "$function_name" --region "$AWS_REGION" &>/dev/null; then
    echo "🔄 Updating existing Lambda: $function_name"
    aws lambda update-function-code \
      --function-name "$function_name" \
      --zip-file "fileb://lambda-packages/${function_name}.zip" \
      --region "$AWS_REGION" > /dev/null
    
    # Aspetta che l'aggiornamento del codice sia completato
    echo "⏳ Waiting for update to complete..."
    aws lambda wait function-updated \
      --function-name "$function_name" \
      --region "$AWS_REGION"

    aws lambda update-function-configuration \
      --function-name "$function_name" \
      --handler index.handler \
      --timeout 900 \
      --memory-size 1024 \
      --environment "Variables={AWS_S3_BUCKET=${AWS_S3_BUCKET},POLLER_NAME=${poller_name},GROUP_KEY=${GROUP_KEY},GROUP_SECRET=${GROUP_SECRET},SECRETS_ENV=${SECRETS_ENV}}" \
      --region "$AWS_REGION" > /dev/null
  else
    echo "🆕 Creating new Lambda: $function_name"
    aws lambda create-function \
      --function-name "$function_name" \
      --runtime nodejs18.x \
      --role "$AWS_LAMBDA_ROLE_ARN" \
      --handler index.handler \
      --zip-file "fileb://lambda-packages/${function_name}.zip" \
      --timeout 900 \
      --memory-size 1024 \
      --environment "Variables={AWS_S3_BUCKET=${AWS_S3_BUCKET},POLLER_NAME=${poller_name},GROUP_KEY=${GROUP_KEY},GROUP_SECRET=${GROUP_SECRET},SECRETS_ENV=${SECRETS_ENV}}" \
      --region "$AWS_REGION" > /dev/null
  fi
  
  # Configura EventBridge rule
  local rule_name="${function_name}-schedule"
  echo "⏰ Configuring EventBridge rule: $rule_name"
  
  aws events put-rule \
    --name "$rule_name" \
    --schedule-expression "$schedule" \
    --region "$AWS_REGION" > /dev/null
  
  # Ottieni l'ARN della Lambda
  local lambda_arn="arn:aws:lambda:${AWS_REGION}:${AWS_ACCOUNT_ID}:function:${function_name}"
  
  # Aggiungi permesso per EventBridge
  aws lambda add-permission \
    --function-name "$function_name" \
    --statement-id "${rule_name}-invoke" \
    --action lambda:InvokeFunction \
    --principal events.amazonaws.com \
    --source-arn "arn:aws:events:${AWS_REGION}:${AWS_ACCOUNT_ID}:rule/${rule_name}" \
    --region "$AWS_REGION" 2>/dev/null || true
  
  # Crea file JSON temporaneo per i targets (evita problemi di escaping)
  local targets_file=$(mktemp)
  cat > "$targets_file" << EOF
[
  {
    "Id": "1",
    "Arn": "${lambda_arn}",
    "Input": "{\"poller\":\"${poller_name}\"}"
  }
]
EOF
  
  # Collega la rule alla Lambda
  aws events put-targets \
    --rule "$rule_name" \
    --targets "file://${targets_file}" \
    --region "$AWS_REGION" > /dev/null
  
  rm -f "$targets_file"
  
  echo "✅ Deployed $function_name with schedule $schedule"
}

# Estrai i poller dalla configurazione JSON usando jq o node
if command -v jq &> /dev/null; then
  # Usa jq se disponibile
  pollers=$(jq -r '.pollers[] | "\(.name)|\(.schedule)"' "$CRON_CONFIG")
else
  # Fallback a node
  pollers=$(node -e "
    const config = require('./$CRON_CONFIG');
    config.pollers.forEach(p => console.log(p.name + '|' + p.schedule));
  ")
fi

# Deploy ogni poller
while IFS='|' read -r poller_name schedule; do
  deploy_lambda "$poller_name" "$schedule"
done <<< "$pollers"

echo "🎉 All Lambda functions deployed successfully!"



