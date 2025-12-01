import type { StripeNewSubscriptionPoint } from '../hooks/useNewSubscriptions';
import type { StripeCancellationPoint } from '../hooks/useCancellations';
import type { MondayNewSubscriptionPoint } from '../hooks/useMondayNewSubscriptions';
import type { MondayCancellationPoint } from '../hooks/useMondayCancellations';

export type DateRange = { from: Date; to: Date };

export type MetricPoint = {
	date: string; // YYYY-MM-DD o YYYY-MM o YYYY-WW
	mrr: number; // in centesimi
	activeCustomers: number;
	arpa: number; // in centesimi
	netNewMrr: number; // in centesimi
};

export type KpiValues = {
	mrr: number;
	activeCustomers: number;
	arpa: number;
	netNewMrr: number;
	mrrDelta: { absolute: number; percent: number };
	customersDelta: { absolute: number; percent: number };
	arpaDelta: { absolute: number; percent: number };
};

function parseDate(dateStr: string): Date {
	const [y, m, d] = dateStr.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d));
}

function dateToKey(date: Date, granularity: 'day' | 'week' | 'month'): string {
	const y = date.getUTCFullYear();
	const m = date.getUTCMonth() + 1;
	const d = date.getUTCDate();
	if (granularity === 'day') return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
	if (granularity === 'month') return `${y}-${String(m).padStart(2, '0')}`;
	// week: ISO week
	const week = getISOWeek(date);
	return `${y}-W${String(week).padStart(2, '0')}`;
}

function getISOWeek(date: Date): number {
	const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	const dayNum = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getGranularity(range: DateRange): 'day' | 'week' | 'month' {
	const days = (range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24);
	if (days > 365) return 'month';
	if (days > 90) return 'week';
	return 'day';
}


export function calculateMetrics(
	newSubs: StripeNewSubscriptionPoint[],
	cancellations: StripeCancellationPoint[],
	range: DateRange,
	mondayNewSubs?: MondayNewSubscriptionPoint[] | null,
	mondayCancellations?: MondayCancellationPoint[] | null
): { series: MetricPoint[]; kpis: KpiValues } {
	// Combina Stripe e Monday subscriptions (stesso formato)
	let allNewSubs: StripeNewSubscriptionPoint[] = [...newSubs];
	if (mondayNewSubs && mondayNewSubs.length > 0) {
		// Monday usa lo stesso formato, possiamo unire direttamente
		allNewSubs = [...allNewSubs, ...mondayNewSubs];
		// Riordina per data
		allNewSubs.sort((a, b) => a.date.localeCompare(b.date));
	}
	
	// Combina Stripe e Monday cancellations (stesso formato)
	let allCancellations: StripeCancellationPoint[] = [...cancellations];
	if (mondayCancellations && mondayCancellations.length > 0) {
		// Monday usa lo stesso formato, possiamo unire direttamente
		allCancellations = [...allCancellations, ...mondayCancellations];
		// Riordina per data
		allCancellations.sort((a, b) => a.date.localeCompare(b.date));
	}
	
	const granularity = getGranularity(range);
	
	// STEP 1: Calcola lo stato baseline alla data "from"
	// Include tutti gli abbonamenti creati PRIMA di "from" che NON sono stati cancellati PRIMA di "from"
	// IMPORTANTE: Per evitare di contare più volte lo stesso contratto, prendiamo solo l'ULTIMO evento per ogni cliente
	let baselineMrr = 0;
	const baselineCustomers = new Set<string>();
	
	// Raggruppa tutti gli eventi PRIMA di "from" per cliente e trova l'ultimo evento non cancellato
	const baselineCustomerLastSubscription = new Map<string, {
		point: StripeNewSubscriptionPoint;
		purchase: { email?: string; amountCents?: number };
		date: Date;
	}>();
	
	for (const point of allNewSubs) {
		const pointDate = parseDate(point.date);
		if (pointDate >= range.from) continue; // Solo quelli creati prima di "from"
		
		// Verifica se è stato cancellato prima di "from"
		let wasCanceled = false;
		for (const cancelPoint of allCancellations) {
			const cancelDate = parseDate(cancelPoint.date);
			if (cancelDate < range.from && cancelDate > pointDate) {
				const cancelEmails = new Set(cancelPoint.cancellations.map((c) => c.email).filter(Boolean) as string[]);
				const newEmails = new Set(point.purchases.map((p) => p.email).filter(Boolean) as string[]);
				const cancelAmount = cancelPoint.totalAmountCents / cancelPoint.count;
				const newAmount = point.totalAmountCents / point.count;
				
				// Match se: email overlap E amount simile (±5% tolleranza)
				for (const email of newEmails) {
					if (cancelEmails.has(email)) {
						const amountMatch = Math.abs(cancelAmount - newAmount) / newAmount < 0.05;
						if (amountMatch) {
							wasCanceled = true;
							break;
						}
					}
				}
				if (wasCanceled) break;
			}
		}
		
		if (!wasCanceled) {
			// Per ogni purchase, aggiorna l'ultimo evento se questo è più recente
			point.purchases.forEach((p) => {
				if (p.email) {
					const existing = baselineCustomerLastSubscription.get(p.email);
					if (!existing || pointDate > existing.date) {
						baselineCustomerLastSubscription.set(p.email, {
							point,
							purchase: p,
							date: pointDate
						});
					}
				}
			});
		}
	}
	
	// Somma gli MRR degli ultimi eventi per ogni cliente nel baseline
	for (const [email, lastSub] of baselineCustomerLastSubscription) {
		baselineCustomers.add(email);
		if (lastSub.purchase.amountCents) {
			baselineMrr += lastSub.purchase.amountCents;
		} else if (lastSub.point.totalAmountCents && lastSub.point.count > 0) {
			baselineMrr += Math.round(lastSub.point.totalAmountCents / lastSub.point.count);
		}
	}

	// STEP 2: Raccogli tutti gli eventi nel range (nuovi e cancellazioni)
	type Event = { date: Date; type: 'new' | 'cancel'; amount: number; emails: Set<string> };
	const events: Event[] = [];

	for (const point of allNewSubs) {
		const pointDate = parseDate(point.date);
		if (pointDate < range.from || pointDate > range.to) continue;
		const emails = new Set(point.purchases.map((p) => p.email).filter(Boolean) as string[]);
		events.push({ date: pointDate, type: 'new', amount: point.totalAmountCents, emails });
	}

	for (const point of allCancellations) {
		const pointDate = parseDate(point.date);
		if (pointDate < range.from || pointDate > range.to) continue;
		const emails = new Set(point.cancellations.map((c) => c.email).filter(Boolean) as string[]);
		events.push({ date: pointDate, type: 'cancel', amount: point.totalAmountCents, emails });
	}

	events.sort((a, b) => a.date.getTime() - b.date.getTime());

	// STEP 3: Calcola serie temporale partendo dal baseline
	const seriesMap: Record<string, { mrr: number; customers: Set<string>; netNew: number }> = {};
	let currentMrr = baselineMrr;
	const currentCustomers = new Set(baselineCustomers);

	// Aggiungi il punto iniziale (baseline)
	const fromKey = dateToKey(range.from, granularity);
	seriesMap[fromKey] = {
		mrr: baselineMrr,
		customers: new Set(baselineCustomers),
		netNew: 0,
	};

	// Applica gli eventi nel range
	for (const event of events) {
		const key = dateToKey(event.date, granularity);
		if (!seriesMap[key]) {
			seriesMap[key] = {
				mrr: currentMrr,
				customers: new Set(currentCustomers),
				netNew: 0,
			};
		}

		if (event.type === 'new') {
			currentMrr += event.amount;
			event.emails.forEach((e) => currentCustomers.add(e));
			seriesMap[key].netNew += event.amount;
		} else {
			currentMrr -= event.amount;
			event.emails.forEach((e) => currentCustomers.delete(e));
			seriesMap[key].netNew -= event.amount;
		}

		// Aggiorna lo stato finale del periodo
		seriesMap[key].mrr = currentMrr;
		seriesMap[key].customers = new Set(currentCustomers);
	}

	// Converti in array e calcola ARPA
	const series: MetricPoint[] = Object.keys(seriesMap)
		.sort()
		.map((k) => {
			const item = seriesMap[k];
			return {
				date: k,
				mrr: item.mrr,
				activeCustomers: item.customers.size,
				arpa: item.customers.size > 0 ? item.mrr / item.customers.size : 0,
				netNewMrr: item.netNew,
			};
		});

	// Calcola KPIs finali
	// IMPORTANTE: Per garantire che toMrr e toCustomers siano sempre gli stessi indipendentemente da "from",
	// calcoliamo direttamente lo stato finale alla data "to" invece di usare la serie
	const fromMrr = series[0]?.mrr ?? baselineMrr;
	const fromCustomers = series[0]?.activeCustomers ?? baselineCustomers.size;
	
	// Calcola direttamente MRR e clienti attivi alla data "to" per garantire coerenza
	// IMPORTANTE: Per evitare di contare più volte lo stesso contratto (es. eventi 2024 + 2025),
	// prendiamo solo l'ULTIMO evento di subscription per ogni cliente
	let finalMrr = 0;
	const finalCustomers = new Set<string>();
	
	// Raggruppa tutti gli eventi di subscription per cliente (email)
	// e trova l'ultimo evento non cancellato per ogni cliente
	const customerLastSubscription = new Map<string, {
		point: StripeNewSubscriptionPoint;
		purchase: { email?: string; amountCents?: number };
		date: Date;
	}>();
	
	// Prima passata: trova l'ultimo evento di subscription per ogni cliente
	for (const point of allNewSubs) {
		const pointDate = parseDate(point.date);
		if (pointDate > range.to) continue; // Solo quelli creati fino a "to"
		
		// Verifica se è stato cancellato entro "to"
		let wasCanceled = false;
		for (const cancelPoint of allCancellations) {
			const cancelDate = parseDate(cancelPoint.date);
			if (cancelDate <= range.to && cancelDate > pointDate) {
				const cancelEmails = new Set(cancelPoint.cancellations.map((c) => c.email).filter(Boolean) as string[]);
				const newEmails = new Set(point.purchases.map((p) => p.email).filter(Boolean) as string[]);
				const cancelAmount = cancelPoint.totalAmountCents / cancelPoint.count;
				const newAmount = point.totalAmountCents / point.count;
				
				// Match se: email overlap E amount simile (±5% tolleranza)
				for (const email of newEmails) {
					if (cancelEmails.has(email)) {
						const amountMatch = Math.abs(cancelAmount - newAmount) / newAmount < 0.05;
						if (amountMatch) {
							wasCanceled = true;
							break;
						}
					}
				}
				if (wasCanceled) break;
			}
		}
		
		if (!wasCanceled) {
			// Per ogni purchase in questo punto, aggiorna l'ultimo evento se questo è più recente
			point.purchases.forEach((p) => {
				if (p.email) {
					const existing = customerLastSubscription.get(p.email);
					if (!existing || pointDate > existing.date) {
						customerLastSubscription.set(p.email, {
							point,
							purchase: p,
							date: pointDate
						});
					}
				}
			});
		}
	}
	
	// Seconda passata: somma gli MRR degli ultimi eventi per ogni cliente
	for (const [email, lastSub] of customerLastSubscription) {
		finalCustomers.add(email);
		if (lastSub.purchase.amountCents) {
			finalMrr += lastSub.purchase.amountCents;
		} else if (lastSub.point.totalAmountCents && lastSub.point.count > 0) {
			finalMrr += Math.round(lastSub.point.totalAmountCents / lastSub.point.count);
		}
	}
	
	const toCustomers = finalCustomers.size;
	const toMrr = finalMrr;
	const toArpa = toCustomers > 0 ? toMrr / toCustomers : 0;
	const fromArpa = fromCustomers > 0 ? fromMrr / fromCustomers : 0;
	const netNewMrrTotal = series.reduce((sum, p) => sum + p.netNewMrr, 0);

	const kpis: KpiValues = {
		mrr: toMrr,
		activeCustomers: toCustomers,
		arpa: toArpa,
		netNewMrr: netNewMrrTotal,
		mrrDelta: {
			absolute: toMrr - fromMrr,
			percent: fromMrr > 0 ? ((toMrr - fromMrr) / fromMrr) * 100 : 0,
		},
		customersDelta: {
			absolute: toCustomers - fromCustomers,
			percent: fromCustomers > 0 ? ((toCustomers - fromCustomers) / fromCustomers) * 100 : 0,
		},
		arpaDelta: {
			absolute: toArpa - fromArpa,
			percent: fromArpa > 0 ? ((toArpa - fromArpa) / fromArpa) * 100 : 0,
		},
	};

	return { series, kpis };
}

// Helper per matchare piano da subscriptionName a PlanTier
function normalizePlanToTier(subscriptionName?: string): 'Basic' | 'Plus' | 'Enterprise' | null {
	if (!subscriptionName) return null;
	const name = subscriptionName.toLowerCase();
	if (name.includes('basic')) return 'Basic';
	if (name.includes('plus')) return 'Plus';
	if (name.includes('enterprise') || name.includes('custom')) return 'Enterprise';
	return null;
}

// Filtra i dataset per piano (Basic/Plus/Enterprise) e numero di webspaces
// webspacesCount viene estratto dal subscriptionName usando la mappa se fornita
export function filterDataByPlanTierAndWebspaces(
    newSubs: StripeNewSubscriptionPoint[],
    cancellations: StripeCancellationPoint[],
    planTier: 'all' | 'Basic' | 'Plus' | 'Enterprise',
    webspacesCount: 'all' | '1' | '5' | '15' | '25',
    webspacesMap?: Record<string, number>
): { newSubs: StripeNewSubscriptionPoint[]; cancellations: StripeCancellationPoint[] } {
    // Filtra per piano
    const filteredNew = newSubs.map((p) => {
        const allPurchases = p.purchases || [];
        let purchases = allPurchases;
        
        // Filtra per piano se specificato
        if (planTier !== 'all') {
            purchases = purchases.filter((pu) => {
                const tier = normalizePlanToTier(pu.subscriptionName);
                return tier === planTier;
            });
        }
        
        // Filtra per numero di webspaces se specificato
        if (webspacesCount !== 'all') {
            purchases = purchases.filter((pu) => {
                // Enterprise non ha webspaces, quindi escludiamo se il filtro richiede webspaces
                const tier = normalizePlanToTier(pu.subscriptionName);
                if (tier === 'Enterprise') return false;
                
                // Usa webspacesCount dai dati se presente, altrimenti estrailo dalla mappa
                let count = pu.webspacesCount;
                if (count === undefined && webspacesMap && pu.subscriptionName) {
                    count = webspacesMap[pu.subscriptionName];
                }
                // Se non trovato nella mappa, escludi (non è un piano con webspaces noti)
                if (count === undefined) return false;
                
                switch (webspacesCount) {
                    case '1': return count === 1;
                    case '5': return count === 5;
                    case '15': return count === 15;
                    case '25': return count === 25;
                    default: return true;
                }
            });
        }
        
        let totalAmountCents = purchases.reduce((sum, pu) => sum + (pu.amountCents || 0), 0);
        if (totalAmountCents === 0 && p.totalAmountCents && p.count) {
            // fallback: ripartizione proporzionale se negli acquisti manca amountCents
            const ratio = purchases.length / p.count;
            totalAmountCents = Math.round(p.totalAmountCents * ratio);
        }
        return {
            ...p,
            purchases,
            count: purchases.length,
            totalAmountCents,
        };
    }).filter((p) => p.count > 0 || p.totalAmountCents > 0);

    const filteredCanc = cancellations.map((c) => {
        const allCanc = c.cancellations || [];
        let cancellationsArr = allCanc;
        
        // Filtra per piano se specificato
        if (planTier !== 'all') {
            cancellationsArr = cancellationsArr.filter((ca) => {
                const tier = normalizePlanToTier(ca.subscriptionName);
                return tier === planTier;
            });
        }
        
        // Filtra per numero di webspaces se specificato
        if (webspacesCount !== 'all') {
            cancellationsArr = cancellationsArr.filter((ca) => {
                // Enterprise non ha webspaces, quindi escludiamo se il filtro richiede webspaces
                const tier = normalizePlanToTier(ca.subscriptionName);
                if (tier === 'Enterprise') return false;
                
                // Usa webspacesCount dai dati se presente, altrimenti estrailo dalla mappa
                let count = ca.webspacesCount;
                if (count === undefined && webspacesMap && ca.subscriptionName) {
                    count = webspacesMap[ca.subscriptionName];
                }
                // Se non trovato nella mappa, escludi (non è un piano con webspaces noti)
                if (count === undefined) return false;
                
                switch (webspacesCount) {
                    case '1': return count === 1;
                    case '5': return count === 5;
                    case '15': return count === 15;
                    case '25': return count === 25;
                    default: return true;
                }
            });
        }
        
        let totalAmountCents = cancellationsArr.reduce((sum, ca) => sum + (ca.amountCents || 0), 0);
        if (totalAmountCents === 0 && c.totalAmountCents && c.count) {
            const ratio = cancellationsArr.length / c.count;
            totalAmountCents = Math.round(c.totalAmountCents * ratio);
        }
        return {
            ...c,
            cancellations: cancellationsArr,
            count: cancellationsArr.length,
            totalAmountCents,
        };
    }).filter((c) => c.count > 0 || c.totalAmountCents > 0);

    return { newSubs: filteredNew, cancellations: filteredCanc };
}

// Filtra i dataset per lista di nomi piano (subscriptionName) mantenendo amounts coerenti
// Mantenuta per retrocompatibilità
export function filterDataByPlans(
    newSubs: StripeNewSubscriptionPoint[],
    cancellations: StripeCancellationPoint[],
    plans: string[] | null
): { newSubs: StripeNewSubscriptionPoint[]; cancellations: StripeCancellationPoint[] } {
    if (!plans || plans.length === 0) return { newSubs, cancellations };

    const planSet = new Set(plans);
    const filteredNew = newSubs.map((p) => {
        const allPurchases = p.purchases || [];
        const purchases = allPurchases.filter((pu) => (pu.subscriptionName ? planSet.has(pu.subscriptionName) : false));
        let totalAmountCents = purchases.reduce((sum, pu) => sum + (pu.amountCents || 0), 0);
        if (totalAmountCents === 0 && p.totalAmountCents && p.count) {
            // fallback: ripartizione proporzionale se negli acquisti manca amountCents
            const ratio = purchases.length / p.count;
            totalAmountCents = Math.round(p.totalAmountCents * ratio);
        }
        return {
            ...p,
            purchases,
            count: purchases.length,
            totalAmountCents,
        };
    }).filter((p) => p.count > 0 || p.totalAmountCents > 0);

    const filteredCanc = cancellations.map((c) => {
        const allCanc = c.cancellations || [];
        const cancellationsArr = allCanc.filter((ca) => (ca.subscriptionName ? planSet.has(ca.subscriptionName) : false));
        let totalAmountCents = cancellationsArr.reduce((sum, ca) => sum + (ca.amountCents || 0), 0);
        if (totalAmountCents === 0 && c.totalAmountCents && c.count) {
            const ratio = cancellationsArr.length / c.count;
            totalAmountCents = Math.round(c.totalAmountCents * ratio);
        }
        return {
            ...c,
            cancellations: cancellationsArr,
            count: cancellationsArr.length,
            totalAmountCents,
        };
    }).filter((c) => c.count > 0 || c.totalAmountCents > 0);

    return { newSubs: filteredNew, cancellations: filteredCanc };
}
