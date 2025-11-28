#!/bin/bash
# Script per testare i poller con S3 (simula ambiente Lambda)

echo "🧪 Test poller con S3 (simula Lambda)"
echo "===================================="
echo ""

# Verifica variabili d'ambiente
if [ -z "$AWS_S3_BUCKET" ]; then
  echo "❌ Errore: AWS_S3_BUCKET non impostato"
  echo "   Esempio: export AWS_S3_BUCKET=avacy-slides"
  exit 1
fi

if [ -z "$AWS_REGION" ]; then
  echo "⚠️  AWS_REGION non impostato, uso eu-central-1"
  export AWS_REGION=eu-central-1
fi

# Simula ambiente Lambda
export AWS_LAMBDA_FUNCTION_NAME=test-poller-function

echo "Configurazione:"
echo "  Bucket: $AWS_S3_BUCKET"
echo "  Region: $AWS_REGION"
echo ""

# Test un poller semplice
echo "1. Test stripe:new-subscriptions con S3..."
npm run poll -- stripe:new-subscriptions

# Verifica che il file sia su S3
echo ""
echo "2. Verifica file su S3..."
if aws s3 ls "s3://$AWS_S3_BUCKET/data/avacy/json/stripe/new-subscriptions.json" &>/dev/null; then
  echo "✅ File trovato su S3!"
  echo "   Path: s3://$AWS_S3_BUCKET/data/avacy/json/stripe/new-subscriptions.json"
  
  # Scarica e mostra info
  aws s3 cp "s3://$AWS_S3_BUCKET/data/avacy/json/stripe/new-subscriptions.json" /tmp/test-s3.json &>/dev/null
  if [ -f /tmp/test-s3.json ]; then
    SIZE=$(wc -c < /tmp/test-s3.json)
    echo "   Size: $SIZE bytes"
    echo "   First 200 chars:"
    head -c 200 /tmp/test-s3.json
    echo "..."
    rm /tmp/test-s3.json
  fi
else
  echo "❌ File NON trovato su S3!"
  exit 1
fi

echo ""
echo "✅ Test S3 completato con successo!"
