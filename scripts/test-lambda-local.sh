#!/bin/bash
# Script per testare il lambda handler localmente

echo "🧪 Test Lambda Handler locale"
echo "============================="
echo ""

# Simula ambiente Lambda
export AWS_LAMBDA_FUNCTION_NAME=test-lambda
export AWS_S3_BUCKET=${AWS_S3_BUCKET:-""}
export AWS_REGION=${AWS_REGION:-eu-central-1}

if [ -z "$AWS_S3_BUCKET" ]; then
  echo "⚠️  AWS_S3_BUCKET non impostato, il test salverà su filesystem locale"
fi

echo "Testando handler con poller: stripe:new-subscriptions"
echo ""

# Usa tsx per eseguire il handler
npx tsx -e "
import { handler } from './src/data/avacy/pollers/lambda-handler.ts';

const event = { poller: 'stripe:new-subscriptions' };
const context = {
  functionName: 'test-lambda',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:eu-central-1:123456789:function:test-lambda',
  memoryLimitInMB: '1024',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/test-lambda',
  logStreamName: '2024/01/01/[\$LATEST]test',
  getRemainingTimeInMillis: () => 900000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

handler(event, context)
  .then(result => {
    console.log('✅ Handler eseguito con successo!');
    console.log('Result:', JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Errore:', error);
    process.exit(1);
  });
"
