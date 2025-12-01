import { PlanTier } from '../types';

/**
 * Rappresentazione di un tenant nel DB (snapshot corrente).
 * Fonte: DB Produzione (Vapor).
 * Clean JSON format.
 */
export interface RawTenant {
  id: string;
  createdAt: string; // ISO Date
  name?: string;
  email?: string;
  plan: string;
  // domains: RIMOSSO perché duplicato di webspaces.names o central_domains poco utile
  
  webspaces: {
    count: number;
    names: string | null; // Nomi dei siti dal DB tenant
  };
  
  users: {
    count: number;
  };
}

export type BillingEventType = 'new_subscription' | 'cancellation' | 'upgrade' | 'downgrade';
export type BillingSource = 'stripe' | 'monday' | 'manual';

export interface RawBillingEvent {
  id: string;
  date: string;
  type: BillingEventType;
  source: BillingSource;
  plan: PlanTier;
  amountCents: number;
  currency: 'EUR';
  customerEmail: string;
  tenantId?: string;
}
