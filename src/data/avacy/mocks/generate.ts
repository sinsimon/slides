import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DashboardData, DashboardHistoryPoint, AccountEntity, PlanTier } from '../types';

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
  Enterprise: 20000, // Media
  Unknown: 0
};

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// Stato corrente simulato durante il loop
let totalTenants = 100; 
let activePlans: Record<PlanTier, number> = {
  Free: 80,
  Basic: 15,
  Plus: 4,
  Enterprise: 1,
  Unknown: 0
};

const history: DashboardHistoryPoint[] = [];
const accounts: AccountEntity[] = [];

// Generiamo history day-by-day
for (let i = 0; i <= DAYS_OF_HISTORY; i++) {
  const currentDate = new Date(START_DATE);
  currentDate.setDate(currentDate.getDate() + i);
  const dateStr = formatDate(currentDate);

  // Simuliamo eventi del giorno
  // 1. Nuovi iscritti (Free)
  const newSignups = Math.random() > 0.3 ? randomInt(0, 2) : 0;
  
  // 2. Conversioni / Nuovi Abbonamenti
  const newBasic = Math.random() > 0.8 ? 1 : 0;
  const newPlus = Math.random() > 0.95 ? 1 : 0;
  const newEnterprise = (i % 60 === 0) ? 1 : 0; // Molto rari

  // 3. Churn (Cancellazioni)
  const churnBasic = (activePlans.Basic > 10 && Math.random() > 0.95) ? 1 : 0;
  
  // Aggiorna stato
  activePlans.Free += newSignups;
  
  // Se uno diventa Basic, immaginiamo venga da Free o sia nuovo diretto. 
  // Semplifichiamo: sono "net new" subscriptions per il breakdown
  activePlans.Basic += (newBasic - churnBasic);
  activePlans.Plus += newPlus;
  activePlans.Enterprise += newEnterprise;
  
  // Ricalcola Free come residuo (per coerenza col modello)
  // In realtà totalTenants aumenta solo con newSignups + quelli che entrano direttamente pagando (raro ma possibile)
  // Assumiamo che tutti entrino come Free (newSignups) e poi convertano.
  // Quindi se activePlans.Basic aumenta, activePlans.Free dovrebbe scendere.
  if (newBasic > 0) activePlans.Free = Math.max(0, activePlans.Free - 1);
  if (newPlus > 0) activePlans.Free = Math.max(0, activePlans.Free - 1);
  if (newEnterprise > 0) activePlans.Free = Math.max(0, activePlans.Free - 1);
  // Se churnano, tornano free? O spariscono? Assumiamo tornino Free.
  if (churnBasic > 0) activePlans.Free++;

  totalTenants = activePlans.Free + activePlans.Basic + activePlans.Plus + activePlans.Enterprise;

  const activeSubscriptions = activePlans.Basic + activePlans.Plus + activePlans.Enterprise;
  const mrr = 
    (activePlans.Basic * PRICE_MAP.Basic) +
    (activePlans.Plus * PRICE_MAP.Plus) +
    (activePlans.Enterprise * PRICE_MAP.Enterprise);

  history.push({
    date: dateStr,
    mrr,
    totalTenants,
    activeSubscriptions,
    breakdown: {
      Free: activePlans.Free,
      Basic: activePlans.Basic,
      Plus: activePlans.Plus,
      Enterprise: activePlans.Enterprise
    }
  });

  // Se siamo negli ultimi 90 giorni, generiamo le entità account simulate per popolarle
  // (Solo per avere dati nella tabella "Ultimi iscritti" o "Clienti Top")
  if (i > DAYS_OF_HISTORY - 90) {
    if (newBasic) createMockAccount('Basic', currentDate, accounts);
    if (newPlus) createMockAccount('Plus', currentDate, accounts);
    if (newEnterprise) createMockAccount('Enterprise', currentDate, accounts);
    for(let k=0; k<newSignups; k++) createMockAccount('Free', currentDate, accounts);
  }
}

function createMockAccount(plan: PlanTier, date: Date, list: AccountEntity[]) {
  const id = Math.random().toString(36).substring(7);
  list.push({
    id: `tenant-${id}`,
    name: `Mock Tenant ${id}`,
    createdAt: date.toISOString(),
    plan,
    mrr: PRICE_MAP[plan],
    webspacesCount: plan === 'Free' ? 1 : randomInt(1, 5),
    usersCount: plan === 'Free' ? 1 : randomInt(2, 10),
    source: plan === 'Enterprise' ? 'monday' : (plan === 'Free' ? 'db_only' : 'stripe')
  });
}

const dashboardData: DashboardData = {
  history,
  accounts: accounts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  lastUpdated: new Date().toISOString()
};

const outputDir = path.join(__dirname, '../json/mock');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
fs.writeFileSync(path.join(outputDir, 'dashboard-mock.json'), JSON.stringify(dashboardData, null, 2));
console.log('Mock data regenerated with realistic constraints.');
