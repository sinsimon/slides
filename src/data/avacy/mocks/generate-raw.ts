import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PlanTier } from '../types';
// Importiamo i tipi esistenti usati dai poller reali per generare mock compatibili
import { StripeNewSubscriptionPoint } from '../hooks/useNewSubscriptions';
import { StripeCancellationPoint } from '../hooks/useCancellations';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurazione
const DAYS_OF_HISTORY = 365;
const START_DATE = new Date();
START_DATE.setDate(START_DATE.getDate() - DAYS_OF_HISTORY);

const PRICE_MAP: Record<PlanTier, number> = {
  Free: 0,
  Basic: 1500,
  Plus: 4900,
  Enterprise: 20000,
  Unknown: 0
};

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}
function formatDateTime(d: Date): string {
  return d.toISOString(); // ISO Full
}

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// Output Structures
// Vapor Tenants ora è un array piatto
const vaporTenants: any[] = [];

// I JSON di Stripe/Monday sono array di punti giornalieri aggregati
const stripeNewSubs: StripeNewSubscriptionPoint[] = [];
const stripeCancels: StripeCancellationPoint[] = [];
const mondayNewSubs: StripeNewSubscriptionPoint[] = []; 
const mondayCancels: StripeCancellationPoint[] = [];

// Stato corrente simulato
const activeSubscriptions: Map<string, { plan: PlanTier, amount: number }> = new Map();

// Simulazione giorno per giorno
for (let i = 0; i <= DAYS_OF_HISTORY; i++) {
  const currentDate = new Date(START_DATE);
  currentDate.setDate(currentDate.getDate() + i);
  const dateStr = formatDate(currentDate);
  const dateTimeStr = formatDateTime(currentDate);

  // Accumulatori eventi del giorno
  const dailyStripeSubs: any[] = [];
  const dailyMondaySubs: any[] = [];
  const dailyStripeCancels: any[] = [];
  const dailyMondayCancels: any[] = [];
  
  let dailyStripeAmt = 0;
  let dailyMondayAmt = 0;
  let dailyStripeCancAmt = 0;
  let dailyMondayCancAmt = 0;

  // 1. Nuovi Tenant (Registrazioni DB)
  const growthFactor = 1 + (i / DAYS_OF_HISTORY) * 2;
  const newTenantCount = Math.random() > 0.5 ? randomInt(0, Math.ceil(2 * growthFactor)) : 0;

  for (let k = 0; k < newTenantCount; k++) {
    const tenantId = `t-${i}-${k}`;
    const email = `user${i}-${k}@example.com`;
    
    // Mock Clean Tenant Object
    const tenant = {
      id: tenantId,
      createdAt: dateTimeStr,
      name: `Azienda ${i}-${k}`,
      email: email,
      plan: 'Free', // Default
      // domains rimosso
      webspaces: {
        count: randomInt(1, 3),
        names: `sito1.com, sito2.it`
      },
      users: {
        count: randomInt(1, 5)
      }
    };
    
    vaporTenants.push(tenant);

    // 2. Conversione (Billing Event)
    const conversionRoll = Math.random();
    let plan: PlanTier = 'Free';
    
    if (conversionRoll > 0.98) plan = 'Enterprise';
    else if (conversionRoll > 0.90) plan = 'Plus';
    else if (conversionRoll > 0.75) plan = 'Basic';

    if (plan !== 'Free') {
      // Mock conversione immediata
      activeSubscriptions.set(tenantId, { plan, amount: PRICE_MAP[plan] });
      const amount = PRICE_MAP[plan];

      const purchase = {
        email,
        subscriptionName: plan,
        amountCents: amount,
        currency: 'EUR',
        metadata: { tenant: tenantId }
      };

      if (plan === 'Enterprise') {
        dailyMondaySubs.push(purchase);
        dailyMondayAmt += amount;
      } else {
        dailyStripeSubs.push(purchase);
        dailyStripeAmt += amount;
      }
    }
  }

  // 3. Churn
  if (activeSubscriptions.size > 0) {
    for (const [tId, sub] of activeSubscriptions.entries()) {
      if (Math.random() < 0.001) {
        const t = vaporTenants.find(c => c.id === tId);
        const email = t?.email || 'unknown';
        
        const cancel = {
          email,
          subscriptionName: sub.plan,
          amountCents: sub.amount,
          currency: 'EUR',
          metadata: { tenant: tId }
        };

        if (sub.plan === 'Enterprise') {
          dailyMondayCancels.push(cancel);
          dailyMondayCancAmt += sub.amount;
        } else {
          dailyStripeCancels.push(cancel);
          dailyStripeCancAmt += sub.amount;
        }
        activeSubscriptions.delete(tId);
      }
    }
  }

  // Push daily points
  if (dailyStripeSubs.length > 0) {
    stripeNewSubs.push({
      date: dateStr, count: dailyStripeSubs.length, totalAmountCents: dailyStripeAmt, currency: 'EUR', purchases: dailyStripeSubs
    });
  }
  if (dailyMondaySubs.length > 0) {
    mondayNewSubs.push({
      date: dateStr, count: dailyMondaySubs.length, totalAmountCents: dailyMondayAmt, currency: 'EUR', purchases: dailyMondaySubs
    });
  }
  if (dailyStripeCancels.length > 0) {
    stripeCancels.push({
      date: dateStr, count: dailyStripeCancels.length, totalAmountCents: dailyStripeCancAmt, currency: 'EUR', cancellations: dailyStripeCancels
    });
  }
  if (dailyMondayCancels.length > 0) {
    mondayCancels.push({
      date: dateStr, count: dailyMondayCancels.length, totalAmountCents: dailyMondayCancAmt, currency: 'EUR', cancellations: dailyMondayCancels
    });
  }
}

// Aggiorna stato finale tenants
vaporTenants.forEach(t => {
  const sub = activeSubscriptions.get(t.id);
  if (sub) {
    t.plan = sub.plan;
  }
});

// Scrittura file mock
const outputDir = path.join(__dirname, '../json/mock');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(path.join(outputDir, 'vapor-tenants.json'), JSON.stringify(vaporTenants, null, 2));
fs.writeFileSync(path.join(outputDir, 'stripe-new-subscriptions.json'), JSON.stringify(stripeNewSubs, null, 2));
fs.writeFileSync(path.join(outputDir, 'stripe-cancellations.json'), JSON.stringify(stripeCancels, null, 2));
fs.writeFileSync(path.join(outputDir, 'monday-new-subscriptions.json'), JSON.stringify(mondayNewSubs, null, 2));
fs.writeFileSync(path.join(outputDir, 'monday-cancellations.json'), JSON.stringify(mondayCancels, null, 2));

console.log('Mock data generated matching real file structures.');
