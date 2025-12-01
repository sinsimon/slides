export type Currency = 'EUR';
export type PlanTier = 'Free' | 'Basic' | 'Plus' | 'Enterprise' | 'Unknown';

/**
 * Snapshot giornaliero delle metriche.
 * Ricostruibile incrociando:
 * 1. DB Tenants (per la data di registrazione e il totale tenant)
 * 2. Stripe/Monday Events (per MRR, abbonamenti attivi e breakdown piani paganti)
 * 
 * Nota: Non possiamo avere lo storico puntuale di 'users' o 'webspaces' perché
 * il DB ci fornisce solo lo stato attuale, non lo storico delle modifiche a quei campi.
 */
export interface DashboardHistoryPoint {
  date: string; // ISO Date YYYY-MM-DD

  // Economics (Ricostruiti da eventi Stripe/Monday)
  mrr: number; // Cents
  
  // Volumi
  totalTenants: number; // Da cdate del DB
  activeSubscriptions: number; // Paganti (Stripe/Monday)
  
  // Breakdown Piani
  // Free = totalTenants - activeSubscriptions (approssimazione valida)
  // Altri = da eventi Stripe/Monday attivi in quella data
  breakdown: {
    Free: number; 
    Basic: number;
    Plus: number;
    Enterprise: number;
  };
}

/**
 * Dettaglio arricchito di un Account.
 * Unisce dati DB (anagrafica, utilizzo) con dati Stripe/Monday (piano, valore economico).
 */
export interface AccountEntity {
  id: string; // Tenant ID
  name: string;
  createdAt: string; // ISO DateTime
  
  // Stato Corrente
  plan: PlanTier;
  mrr: number; // Valore attuale
  
  // Metriche di Utilizzo (Solo stato attuale, da DB)
  webspacesCount: number;
  usersCount: number;
  
  source: 'stripe' | 'monday' | 'db_only';
}

export interface DashboardData {
  history: DashboardHistoryPoint[];
  accounts: AccountEntity[];
  lastUpdated: string;
}
