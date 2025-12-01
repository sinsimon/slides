import { useEffect, useState, useMemo } from 'react';
import { DashboardData, DashboardHistoryPoint, AccountEntity, PlanTier } from '../types';
import { RawTenant, RawBillingEvent } from '../types/raw';
import { buildDataUrl } from '../utils/assets';
import { StripeNewSubscriptionPoint } from '../hooks/useNewSubscriptions';
import { StripeCancellationPoint } from '../hooks/useCancellations';

// Path dei Mock (che replicano la struttura Prod)
const VAPOR_TENANTS_URL = buildDataUrl('data/avacy/json/mock/vapor-tenants.json');
const STRIPE_NEW_SUBS_URL = buildDataUrl('data/avacy/json/mock/stripe-new-subscriptions.json');
const STRIPE_CANCELS_URL = buildDataUrl('data/avacy/json/mock/stripe-cancellations.json');
const MONDAY_NEW_SUBS_URL = buildDataUrl('data/avacy/json/mock/monday-new-subscriptions.json');
const MONDAY_CANCELS_URL = buildDataUrl('data/avacy/json/mock/monday-cancellations.json');

export function useDashboardData() {
  const [rawTenants, setRawTenants] = useState<RawTenant[] | null>(null);
  const [rawBilling, setRawBilling] = useState<RawBillingEvent[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetch(VAPOR_TENANTS_URL).then(r => r.json() as Promise<RawTenant[]>),
      fetch(STRIPE_NEW_SUBS_URL).then(r => r.json() as Promise<StripeNewSubscriptionPoint[]>),
      fetch(STRIPE_CANCELS_URL).then(r => r.json() as Promise<StripeCancellationPoint[]>),
      fetch(MONDAY_NEW_SUBS_URL).then(r => r.json() as Promise<StripeNewSubscriptionPoint[]>),
      fetch(MONDAY_CANCELS_URL).then(r => r.json() as Promise<StripeCancellationPoint[]>)
    ])
    .then(([vaporData, stripeNew, stripeCanc, mondayNew, mondayCanc]) => {
      if (!cancelled) {
        // 1. Tenants: Il JSON è già nel formato RawTenant[] (Clean JSON)
        setRawTenants(vaporData);

        // 2. Normalizzazione Billing Events
        const events: RawBillingEvent[] = [];

        const processNewSubs = (points: StripeNewSubscriptionPoint[], source: 'stripe' | 'monday') => {
          points.forEach(pt => {
            pt.purchases.forEach((p, idx) => {
              events.push({
                id: `${source}-sub-${pt.date}-${idx}`,
                date: pt.date,
                type: 'new_subscription',
                source,
                plan: (p.subscriptionName as PlanTier) || 'Unknown',
                amountCents: p.amountCents || 0,
                currency: 'EUR',
                customerEmail: p.email || '',
                tenantId: p.metadata?.tenant
              });
            });
          });
        };

        const processCancels = (points: StripeCancellationPoint[], source: 'stripe' | 'monday') => {
          points.forEach(pt => {
            pt.cancellations.forEach((c, idx) => {
              events.push({
                id: `${source}-canc-${pt.date}-${idx}`,
                date: pt.date,
                type: 'cancellation',
                source,
                plan: (c.subscriptionName as PlanTier) || 'Unknown',
                amountCents: c.amountCents || 0,
                currency: 'EUR',
                customerEmail: c.email || '',
                tenantId: c.metadata?.tenant
              });
            });
          });
        };

        processNewSubs(stripeNew, 'stripe');
        processNewSubs(mondayNew, 'monday');
        processCancels(stripeCanc, 'stripe');
        processCancels(mondayCanc, 'monday');

        setRawBilling(events);
      }
    })
    .catch(err => {
      if (!cancelled) setError(err);
    })
    .finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  const data = useMemo<DashboardData | null>(() => {
    if (!rawTenants || !rawBilling) return null;

    const sortedEvents = [...rawBilling].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedTenants = [...rawTenants].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (sortedTenants.length === 0) return null;

    const startDate = new Date(sortedTenants[0].createdAt);
    const endDate = new Date(); 
    const history: DashboardHistoryPoint[] = [];

    let currentTenantsCount = 0;
    let currentSubsCount = 0;
    let currentMrr = 0;
    const currentPlans: Record<PlanTier, number> = { Free: 0, Basic: 0, Plus: 0, Enterprise: 0, Unknown: 0 };

    let tIdx = 0;
    let eIdx = 0;

    startDate.setHours(0,0,0,0);
    endDate.setHours(23,59,59,999);

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayStr = d.toISOString().split('T')[0];
      const nextDay = new Date(d); 
      nextDay.setDate(d.getDate() + 1);

      // A. Processa nuovi tenants
      while (tIdx < sortedTenants.length) {
        const tDate = new Date(sortedTenants[tIdx].createdAt);
        if (tDate < nextDay) {
          currentTenantsCount++;
          currentPlans.Free++; 
          tIdx++;
        } else {
          break;
        }
      }

      // B. Processa eventi di billing
      while (eIdx < sortedEvents.length) {
        const eDate = new Date(sortedEvents[eIdx].date);
        if (eDate < nextDay) {
          const ev = sortedEvents[eIdx];
          
          if (ev.type === 'new_subscription') {
            currentSubsCount++;
            currentMrr += ev.amountCents;
            
            if (currentPlans.Free > 0) currentPlans.Free--;
            const p = ev.plan as PlanTier;
            currentPlans[p] = (currentPlans[p] || 0) + 1;

          } else if (ev.type === 'cancellation') {
            currentSubsCount--;
            currentMrr -= ev.amountCents;
            
            const p = ev.plan as PlanTier;
            if ((currentPlans[p] || 0) > 0) currentPlans[p]--;
            currentPlans.Free++;
          }
          
          eIdx++;
        } else {
          break;
        }
      }

      history.push({
        date: dayStr,
        totalTenants: currentTenantsCount,
        activeSubscriptions: currentSubsCount,
        mrr: currentMrr,
        breakdown: {
          Free: Math.max(0, currentPlans.Free),
          Basic: currentPlans.Basic,
          Plus: currentPlans.Plus,
          Enterprise: currentPlans.Enterprise
        }
      });
    }

    // 2. Accounts
    const accounts: AccountEntity[] = rawTenants.map(t => {
      let mrr = 0;
      const plan = t.plan as PlanTier;
      if (plan === 'Basic') mrr = 1500;
      else if (plan === 'Plus') mrr = 4900;
      else if (plan === 'Enterprise') mrr = 20000;
      
      return {
        id: t.id,
        name: t.name || t.id,
        createdAt: t.createdAt,
        plan: plan,
        mrr: mrr,
        webspacesCount: t.webspaces.count,
        usersCount: t.users.count,
        source: plan === 'Enterprise' ? 'monday' : (plan === 'Free' ? 'db_only' : 'stripe'),
        primaryEmail: t.email || undefined,
        // Preferisci i nomi dei webspace se presenti, altrimenti i domini centrali
        domain: t.webspaces.names || t.domains || undefined
      };
    }).sort((a, b) => b.mrr - a.mrr);

    return {
      history,
      accounts,
      lastUpdated: new Date().toISOString()
    };

  }, [rawTenants, rawBilling]);

  return { data, loading, error };
}
