#!/bin/bash
# Script per testare i poller localmente (verifica compatibilità filesystem)

set -e

echo "🧪 Test Poller Locale"
echo "===================="
echo ""

# Verifica che le variabili d'ambiente non siano impostate (per forzare modalità locale)
if [ -n "$AWS_LAMBDA_FUNCTION_NAME" ]; then
  echo "⚠️  AWS_LAMBDA_FUNCTION_NAME è impostato, lo rimuovo per test locale"
  unset AWS_LAMBDA_FUNCTION_NAME
fi

# Test con un poller semplice (Stripe)
echo "📋 Test 1: stripe:new-subscriptions"
echo "-----------------------------------"
npm run poll -- stripe:new-subscriptions

if [ -f "src/data/avacy/json/stripe/new-subscriptions.json" ]; then
  echo "✅ File creato correttamente in locale"
  echo "   Dimensione: $(wc -l < src/data/avacy/json/stripe/new-subscriptions.json) righe"
else
  echo "❌ File non trovato!"
  exit 1
fi

echo ""
echo "✅ Test locale completato con successo!"
echo ""
echo "💡 I poller salvano correttamente su filesystem locale"
