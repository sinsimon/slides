import React, { useMemo, useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { SlideTitle, Nav, SourceLabel } from '@components';
import styles from '../../components/DataTable.module.css';
import { useNewSubscriptions } from '../../data/avacy/hooks/useNewSubscriptions';
import { useCancellations } from '../../data/avacy/hooks/useCancellations';
import { useMondayNewSubscriptions } from '../../data/avacy/hooks/useMondayNewSubscriptions';
import { useMondayCancellations } from '../../data/avacy/hooks/useMondayCancellations';
import { useRaiNewSubscriptions } from '../../data/avacy/hooks/useRaiNewSubscriptions';
import { useRaiCancellations } from '../../data/avacy/hooks/useRaiCancellations';
import { useFileLastModified } from '../../data/avacy/hooks/useFileLastModified';
import { calculateMetrics, filterDataByPlans, filterDataByPlanTierAndWebspaces, type DateRange } from '../../data/avacy/utils/metrics';

// Helper per normalizzare il nome del piano (copiato da metrics.ts per evitare export)
function normalizePlanToTier(subscriptionName?: string): 'Basic' | 'Plus' | 'Enterprise' | null {
	if (!subscriptionName) return null;
	const name = subscriptionName.toLowerCase();
	if (name.includes('basic')) return 'Basic';
	if (name.includes('plus')) return 'Plus';
	if (name.includes('enterprise') || name.includes('custom')) return 'Enterprise';
	return null;
}

type MetricTab = 'mrr' | 'customers' | 'arpa';

const PRESETS = [
	{ label: 'Ultimi 30 giorni', days: 30 },
	{ label: 'Mese Corrente', getRange: () => {
		const now = new Date();
		const from = new Date(now.getFullYear(), now.getMonth(), 1);
		const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
		return { from, to };
	}},
	{ label: 'Trimestre Corrente', getRange: () => {
		const now = new Date();
		const quarter = Math.floor(now.getMonth() / 3);
		const from = new Date(now.getFullYear(), quarter * 3, 1);
		const to = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
		return { from, to };
	}},
	{ label: 'Anno Corrente', getRange: () => {
		const now = new Date();
		const from = new Date(now.getFullYear(), 0, 1);
		const to = new Date(now.getFullYear(), 11, 31);
		return { from, to };
	}},
];

function formatCurrency(cents: number): string {
	return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(cents / 100);
}

function formatInt(value: number): string {
	return value.toLocaleString('it-IT', { maximumFractionDigits: 0 });
}

function formatDelta(absolute: number, percent: number): string {
	const sign = absolute >= 0 ? '+' : '';
	return `${sign}${formatCurrency(absolute)} (${sign}${percent.toFixed(1)}%)`;
}

// Mappa hardcoded per estrarre il numero di webspaces dal subscriptionName
const WEBSPACES_COUNT_MAP: Record<string, number> = {
	'Piano basic': 1, // Piano vecchio senza specifica, trattato come 1 spazio
	'Avacy Basic - 1 spazio web': 1,
	'Avacy Basic - 5 spazi web': 5,
	'Avacy Basic - 15 spazi web': 15,
	'Avacy Basic - 25 spazi web': 25,
	'Avacy Plus - 1 spazio web': 1,
	'Avacy Plus - 5 spazi web': 5,
	'Avacy Plus - 15 spazi web': 15,
	'Avacy Plus - 25 spazi web': 25,
};

export function SlideHeadlineMetrics() {
	const { data: newSubs, loading: loadingNew } = useNewSubscriptions();
	const { data: cancellations, loading: loadingCanc } = useCancellations();
	const { data: mondayNewSubs, loading: loadingMondayNew } = useMondayNewSubscriptions();
	const { data: mondayCancellations, loading: loadingMondayCanc } = useMondayCancellations();
	const { data: raiNewSubs, loading: loadingRaiNew } = useRaiNewSubscriptions();
	const { data: raiCancellations, loading: loadingRaiCanc } = useRaiCancellations();
	
	const sourceUrls = [
		'avacy/json/stripe/new-subscriptions.json',
		'avacy/json/stripe/cancellations.json',
		'avacy/json/monday/new-subscriptions.json',
		'avacy/json/monday/cancellations.json',
		'avacy/json/rai/new-subscriptions.json',
		'avacy/json/rai/cancellations.json'
	];
	const lastUpdated = useFileLastModified(sourceUrls);
	const [selectedPlanTier, setSelectedPlanTier] = useState<'all' | 'Basic' | 'Plus' | 'Enterprise'>('all');
	const [selectedWebspacesCount, setSelectedWebspacesCount] = useState<'all' | '1' | '5' | '15' | '25'>('all');
	const [excludeMonday, setExcludeMonday] = useState<boolean>(false);
	const [excludeStripe, setExcludeStripe] = useState<boolean>(false);
	const [excludeRai, setExcludeRai] = useState<boolean>(false);
	const [selectedTab, setSelectedTab] = useState<MetricTab>('mrr');
	const [showFilters, setShowFilters] = useState<boolean>(false);
	// Inizializza con tutti i dati disponibili (all the time)
	const [fromDate, setFromDate] = useState<string>(() => {
		return '2020-01-01'; // Data di inizio storico
	});
	const [toDate, setToDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

	const range: DateRange = useMemo(() => ({
		from: new Date(fromDate + 'T00:00:00Z'),
		to: new Date(toDate + 'T23:59:59Z'),
	}), [fromDate, toDate]);

	// Quando si nascondono i filtri, resetta il range a "lifetime" e i filtri
	useEffect(() => {
		if (!showFilters) {
			setFromDate('2020-01-01');
			setToDate(new Date().toISOString().split('T')[0]);
			setSelectedPlanTier('all');
			setSelectedWebspacesCount('all');
		}
	}, [showFilters]);

	// Quando si seleziona Enterprise, resetta il filtro webspaces a "all" (Enterprise non ha webspaces)
	useEffect(() => {
		if (selectedPlanTier === 'Enterprise') {
			setSelectedWebspacesCount('all');
		}
	}, [selectedPlanTier]);

	const { allPlans, planCounts, planCategories } = useMemo(() => {
		const names = new Set<string>();
		const counts: Record<string, number> = {};
		
		(newSubs || []).forEach((p) => {
			p.purchases.forEach((pu) => {
				if (pu.subscriptionName) {
					names.add(pu.subscriptionName);
					counts[pu.subscriptionName] = (counts[pu.subscriptionName] || 0) + 1;
				}
			});
		});
		(cancellations || []).forEach((c) => {
			c.cancellations.forEach((ca) => {
				if (ca.subscriptionName) {
					names.add(ca.subscriptionName);
					counts[ca.subscriptionName] = (counts[ca.subscriptionName] || 0) + 1;
				}
			});
		});
		(mondayNewSubs || []).forEach((p) => {
			p.purchases.forEach((pu) => {
				if (pu.subscriptionName) {
					names.add(pu.subscriptionName);
					counts[pu.subscriptionName] = (counts[pu.subscriptionName] || 0) + 1;
				}
			});
		});
		(mondayCancellations || []).forEach((c) => {
			c.cancellations.forEach((ca) => {
				if (ca.subscriptionName) {
					names.add(ca.subscriptionName);
					counts[ca.subscriptionName] = (counts[ca.subscriptionName] || 0) + 1;
				}
			});
		});
		(raiNewSubs || []).forEach((p) => {
			p.purchases.forEach((pu) => {
				if (pu.subscriptionName) {
					names.add(pu.subscriptionName);
					counts[pu.subscriptionName] = (counts[pu.subscriptionName] || 0) + 1;
				}
			});
		});
		
		// Filtra solo piani con conteggio > 0
		const plansWithCount = Array.from(names).filter((name) => (counts[name] || 0) > 0).sort();
		
		// Raggruppa per categoria (Basic, Plus, Premium)
		const categories: Record<string, string[]> = { basic: [], plus: [], premium: [] };
		plansWithCount.forEach((name) => {
			const lower = name.toLowerCase();
			if (lower.includes('basic')) categories.basic.push(name);
			else if (lower.includes('plus')) categories.plus.push(name);
			else if (lower.includes('premium')) categories.premium.push(name);
		});
		
		return {
			allPlans: plansWithCount,
			planCounts: counts,
			planCategories: categories,
		};
	}, [newSubs, cancellations, mondayNewSubs, mondayCancellations, raiNewSubs]);

	const { series, kpis } = useMemo(() => {
		if (!newSubs || !cancellations) return { series: [], kpis: null };
		
		// Applica filtri per fonte dati
		const filteredNewSubs = excludeStripe ? [] : newSubs;
		const filteredCancellations = excludeStripe ? [] : cancellations;
		let filteredMondayNewSubs = excludeMonday ? null : mondayNewSubs;
		let filteredMondayCancellations = excludeMonday ? null : mondayCancellations;
		let filteredRaiNewSubs = excludeRai ? null : raiNewSubs;
		let filteredRaiCancellations = excludeRai ? null : raiCancellations;
		
		// Applica filtri per piano e webspaces (webspacesCount viene estratto dal subscriptionName usando la mappa)
		const filtered = filterDataByPlanTierAndWebspaces(
			filteredNewSubs, 
			filteredCancellations, 
			selectedPlanTier, 
			selectedWebspacesCount,
			WEBSPACES_COUNT_MAP
		);
		
		// Applica gli stessi filtri anche a Monday se presente
		if (filteredMondayNewSubs && filteredMondayCancellations) {
			const mondayFiltered = filterDataByPlanTierAndWebspaces(
				filteredMondayNewSubs,
				filteredMondayCancellations,
				selectedPlanTier,
				selectedWebspacesCount,
				WEBSPACES_COUNT_MAP
			);
			filteredMondayNewSubs = mondayFiltered.newSubs;
			filteredMondayCancellations = mondayFiltered.cancellations;
		}

		// Applica filtri a RAI
		if (filteredRaiNewSubs) {
			const raiFiltered = filterDataByPlanTierAndWebspaces(
				filteredRaiNewSubs,
				filteredRaiCancellations || [], // Se raiCancellations è null, passa array vuoto
				selectedPlanTier,
				selectedWebspacesCount,
				WEBSPACES_COUNT_MAP
			);
			filteredRaiNewSubs = raiFiltered.newSubs;
			if (filteredRaiCancellations) {
				filteredRaiCancellations = raiFiltered.cancellations;
			}
		}
		
		return calculateMetrics(filtered.newSubs, filtered.cancellations, range, filteredMondayNewSubs, filteredMondayCancellations, filteredRaiNewSubs, filteredRaiCancellations);
	}, [newSubs, cancellations, selectedPlanTier, selectedWebspacesCount, range, mondayNewSubs, mondayCancellations, raiNewSubs, raiCancellations, excludeMonday, excludeStripe, excludeRai]);

	// Estrai abbonamenti attivi filtrati per la tabella
	const activeSubscriptions = useMemo(() => {
		if (!newSubs || !cancellations) return [];
		
		// Applica gli stessi filtri
		const filteredNewSubs = excludeStripe ? [] : newSubs;
		const filteredCancellations = excludeStripe ? [] : cancellations;
		let filteredMondayNewSubs = excludeMonday ? null : mondayNewSubs;
		let filteredMondayCancellations = excludeMonday ? null : mondayCancellations;
		let filteredRaiNewSubs = excludeRai ? null : raiNewSubs;
		let filteredRaiCancellations = excludeRai ? null : raiCancellations;
		
		const filtered = filterDataByPlanTierAndWebspaces(
			filteredNewSubs, 
			filteredCancellations, 
			selectedPlanTier, 
			selectedWebspacesCount,
			WEBSPACES_COUNT_MAP
		);
		
		// Filtra Monday solo se presente (gli Enterprise vengono da Monday)
		if (filteredMondayNewSubs && filteredMondayCancellations) {
			const mondayFiltered = filterDataByPlanTierAndWebspaces(
				filteredMondayNewSubs,
				filteredMondayCancellations,
				selectedPlanTier,
				selectedWebspacesCount,
				WEBSPACES_COUNT_MAP
			);
			filteredMondayNewSubs = mondayFiltered.newSubs;
			filteredMondayCancellations = mondayFiltered.cancellations;
		} else if (!excludeMonday && mondayNewSubs && mondayCancellations) {
			// Se Monday non è stato ancora filtrato, filtra ora
			const mondayFiltered = filterDataByPlanTierAndWebspaces(
				mondayNewSubs,
				mondayCancellations,
				selectedPlanTier,
				selectedWebspacesCount,
				WEBSPACES_COUNT_MAP
			);
			filteredMondayNewSubs = mondayFiltered.newSubs;
			filteredMondayCancellations = mondayFiltered.cancellations;
		}

		if (filteredRaiNewSubs) {
			const raiFiltered = filterDataByPlanTierAndWebspaces(
				filteredRaiNewSubs,
				filteredRaiCancellations || [],
				selectedPlanTier,
				selectedWebspacesCount,
				WEBSPACES_COUNT_MAP
			);
			filteredRaiNewSubs = raiFiltered.newSubs;
			if (filteredRaiCancellations) {
				filteredRaiCancellations = raiFiltered.cancellations;
			}
		}
		
		// Raccogli tutti gli abbonamenti fino alla data "to"
		const subscriptions = new Map<string, {
			email: string;
			subscriptionName: string;
			amountCents: number;
			date: string;
			source: 'stripe' | 'monday' | 'rai';
			webspacesCount?: number;
		}>();
		
		// Processa Stripe
		for (const point of filtered.newSubs) {
			const pointDate = new Date(point.date + 'T00:00:00Z');
			if (pointDate > range.to) continue;
			
			for (const purchase of point.purchases) {
				if (!purchase.email) continue;
				const key = purchase.email.toLowerCase();
				const existing = subscriptions.get(key);
				if (!existing || pointDate > new Date(existing.date + 'T00:00:00Z')) {
					subscriptions.set(key, {
						email: purchase.email,
						subscriptionName: purchase.subscriptionName || 'Unknown',
						amountCents: purchase.amountCents || 0,
						date: point.date,
						source: 'stripe',
						webspacesCount: purchase.webspacesCount ?? (purchase.subscriptionName ? WEBSPACES_COUNT_MAP[purchase.subscriptionName] : undefined)
					});
				}
			}
		}
		
		// Processa Monday
		if (filteredMondayNewSubs) {
			for (const point of filteredMondayNewSubs) {
				const pointDate = new Date(point.date + 'T00:00:00Z');
				if (pointDate > range.to) continue;
				
				for (const purchase of point.purchases) {
					if (!purchase.email) continue;
					const key = purchase.email.toLowerCase();
					const existing = subscriptions.get(key);
					if (!existing || pointDate > new Date(existing.date + 'T00:00:00Z')) {
						subscriptions.set(key, {
							email: purchase.email,
							subscriptionName: purchase.subscriptionName || 'Unknown',
							amountCents: purchase.amountCents || 0,
							date: point.date,
							source: 'monday',
							webspacesCount: purchase.webspacesCount ?? (purchase.subscriptionName ? WEBSPACES_COUNT_MAP[purchase.subscriptionName] : undefined)
						});
					}
				}
			}
		}

		// Processa RAI
		if (filteredRaiNewSubs) {
			for (const point of filteredRaiNewSubs) {
				const pointDate = new Date(point.date + 'T00:00:00Z');
				if (pointDate > range.to) continue;
				
				for (const purchase of point.purchases) {
					if (!purchase.email) continue;
					const key = purchase.email.toLowerCase();
					const existing = subscriptions.get(key);
					if (!existing || pointDate > new Date(existing.date + 'T00:00:00Z')) {
						subscriptions.set(key, {
							email: purchase.email,
							subscriptionName: purchase.subscriptionName || 'Unknown',
							amountCents: purchase.amountCents || 0,
							date: point.date,
							source: 'rai',
							webspacesCount: purchase.webspacesCount ?? (purchase.subscriptionName ? WEBSPACES_COUNT_MAP[purchase.subscriptionName] : undefined)
						});
					}
				}
			}
		}
		
		// Rimuovi cancellazioni
		for (const point of filtered.cancellations) {
			const cancelDate = new Date(point.date + 'T00:00:00Z');
			if (cancelDate > range.to) continue;
			
			for (const cancellation of point.cancellations) {
				if (!cancellation.email) continue;
				const key = cancellation.email.toLowerCase();
				const existing = subscriptions.get(key);
				if (existing && cancelDate >= new Date(existing.date + 'T00:00:00Z')) {
					subscriptions.delete(key);
				}
			}
		}
		
		if (filteredMondayCancellations) {
			for (const point of filteredMondayCancellations) {
				const cancelDate = new Date(point.date + 'T00:00:00Z');
				if (cancelDate > range.to) continue;
				
				for (const cancellation of point.cancellations) {
					if (!cancellation.email) continue;
					const key = cancellation.email.toLowerCase();
					const existing = subscriptions.get(key);
					if (existing && cancelDate >= new Date(existing.date + 'T00:00:00Z')) {
						subscriptions.delete(key);
					}
				}
			}
		}

		if (filteredRaiCancellations) {
			for (const point of filteredRaiCancellations) {
				const cancelDate = new Date(point.date + 'T00:00:00Z');
				if (cancelDate > range.to) continue;
				
				for (const cancellation of point.cancellations) {
					if (!cancellation.email) continue;
					const key = cancellation.email.toLowerCase();
					const existing = subscriptions.get(key);
					if (existing && cancelDate >= new Date(existing.date + 'T00:00:00Z')) {
						subscriptions.delete(key);
					}
				}
			}
		}
		
		return Array.from(subscriptions.values())
			.sort((a, b) => b.amountCents - a.amountCents)
			.slice(0, 50); // Limita a 50 per performance
	}, [newSubs, cancellations, mondayNewSubs, mondayCancellations, raiNewSubs, raiCancellations, selectedPlanTier, selectedWebspacesCount, range, excludeMonday, excludeStripe, excludeRai]);

	// Calcola clienti attivi per categoria alla fine del periodo (usando i dati filtrati)
	const customersByCategory = useMemo(() => {
		// Usa activeSubscriptions che già applica tutti i filtri
		let basic = 0, plus = 0, enterprise = 0;
		
		for (const sub of activeSubscriptions) {
			const tier = normalizePlanToTier(sub.subscriptionName);
			if (tier === 'Basic') {
				basic++;
			} else if (tier === 'Plus') {
				plus++;
			} else if (tier === 'Enterprise') {
				enterprise++;
			}
		}
		
		return { basic, plus, enterprise };
	}, [activeSubscriptions]);


	// Calcola dominio Y per centrare sui valori effettivi
	const getYDomain = (dataKey: 'mrr' | 'activeCustomers' | 'arpa' | 'netNewMrr') => {
		if (series.length === 0) return [0, 100];
		const values = series.map((p) => p[dataKey]).filter((v) => typeof v === 'number');
		if (values.length === 0) return [0, 100];
		const min = Math.min(...values);
		const max = Math.max(...values);
		const padding = (max - min) * 0.1;
		return [Math.max(0, min - padding), max + padding];
	};

	const loading = loadingNew || loadingCanc || loadingMondayNew || loadingMondayCanc || loadingRaiNew || loadingRaiCanc;

	if (loading) return <div className="container"><div style={{ padding: 48, textAlign: 'center' }}>Caricamento...</div></div>;
	if (!kpis) return <div className="container"><div style={{ padding: 48, textAlign: 'center' }}>Nessun dato disponibile</div></div>;

	function Info({ text }: { text: string }) {
		const [open, setOpen] = useState(false);
		const [pos, setPos] = useState({ top: 0, left: 0 });
		const [align, setAlign] = useState<'left' | 'center' | 'right'>('center');
		const iconRef = React.useRef<HTMLSpanElement>(null);
		const TOOLTIP_WIDTH = 400; // deve restare sincronizzato con lo style del tooltip
		const MARGIN = 8;

		const handleMouseEnter = () => {
			if (!iconRef.current) { setOpen(true); return; }
			const rect = iconRef.current.getBoundingClientRect();
			const viewportWidth = window.innerWidth;
			const desiredCenter = rect.left + rect.width / 2;
			const half = TOOLTIP_WIDTH / 2;

			let computedLeft = desiredCenter;
			let computedAlign: 'left' | 'center' | 'right' = 'center';

			if (desiredCenter - half < MARGIN) {
				computedLeft = MARGIN;
				computedAlign = 'left';
			} else if (desiredCenter + half > viewportWidth - MARGIN) {
				computedLeft = viewportWidth - MARGIN;
				computedAlign = 'right';
			}

			setPos({ top: rect.top - 8, left: computedLeft });
			setAlign(computedAlign);
			setOpen(true);
		};

		return (
			<>
				<span
					ref={iconRef}
					aria-label={text}
					style={{ cursor: 'help', fontSize: 14, color: 'var(--primary-2)', fontWeight: 600, display: 'inline-block' }}
					onMouseEnter={handleMouseEnter}
					onMouseLeave={() => setOpen(false)}
				>
					ℹ️
				</span>
				{open && (
					<div style={{
						position: 'fixed',
						zIndex: 10000,
						top: pos.top,
						left: pos.left,
						transform: align === 'center' ? 'translate(-50%, -100%)' : align === 'left' ? 'translate(0, -100%)' : 'translate(-100%, -100%)',
						width: TOOLTIP_WIDTH,
						background: 'rgba(18, 20, 23, 0.98)',
						border: '1px solid rgba(255, 122, 60, 0.4)',
						borderRadius: 8,
						padding: '12px 14px',
						color: 'var(--text)',
						fontSize: 13,
						lineHeight: 1.6,
						boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
						whiteSpace: 'normal',
						wordWrap: 'break-word',
						pointerEvents: 'none',
					}}>
						{text}
					</div>
				)}
			</>
		);
	}

    // Le metriche headline sono mostrate come KPI cards in alto, senza pannelli informativi aggiuntivi

	return (
		<div className="container">
			<header className="bar" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
				<div>
					<SlideTitle>Headline Metrics</SlideTitle>
					<SourceLabel 
						label="Stripe / Monday / RAI"
						sources={[
							{ label: 'Stripe - Nuove Sottoscrizioni', url: 'data/avacy/json/stripe/new-subscriptions.json', lastUpdated: lastUpdated['avacy/json/stripe/new-subscriptions.json'] || undefined },
							{ label: 'Stripe - Cancellazioni', url: 'data/avacy/json/stripe/cancellations.json', lastUpdated: lastUpdated['avacy/json/stripe/cancellations.json'] || undefined },
							{ label: 'Monday - Nuove Sottoscrizioni', url: 'data/avacy/json/monday/new-subscriptions.json', lastUpdated: lastUpdated['avacy/json/monday/new-subscriptions.json'] || undefined },
							{ label: 'Monday - Cancellazioni', url: 'data/avacy/json/monday/cancellations.json', lastUpdated: lastUpdated['avacy/json/monday/cancellations.json'] || undefined },
							{ label: 'RAI - Nuove Sottoscrizioni', url: 'data/avacy/json/rai/new-subscriptions.json', lastUpdated: lastUpdated['avacy/json/rai/new-subscriptions.json'] || undefined },
							{ label: 'RAI - Cancellazioni', url: 'data/avacy/json/rai/cancellations.json', lastUpdated: lastUpdated['avacy/json/rai/cancellations.json'] || undefined }
						]}
					/>
				</div>
				<Nav />
			</header>

        {/* Sezione 0: KPI Cards in alto */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            {/* MRR Totale */}
            <div className={styles.panel} style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>MRR Totale</h3>
                    <Info text="Monthly Recurring Revenue: Il fatturato ricorrente mensile normalizzato da tutti gli abbonamenti attivi alla fine del periodo selezionato." />
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
                    {formatCurrency(kpis.mrr)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {formatDelta(kpis.mrrDelta.absolute, kpis.mrrDelta.percent)}
                </div>
            </div>

            {/* Clienti Attivi con suddivisione per categoria */}
            <div className={styles.panel} style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>Clienti Attivi</h3>
                    <Info text="Clienti Attivi: Il numero totale di clienti con almeno un abbonamento attivo alla fine del periodo." />
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
                    {formatInt(kpis.activeCustomers)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                    {`${kpis.customersDelta.absolute >= 0 ? '+' : ''}${kpis.customersDelta.absolute} (${kpis.customersDelta.percent >= 0 ? '+' : ''}${kpis.customersDelta.percent.toFixed(1)}%)`}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    {customersByCategory.basic > 0 && <div>Basic: {formatInt(customersByCategory.basic)}</div>}
                    {customersByCategory.plus > 0 && <div>Plus: {formatInt(customersByCategory.plus)}</div>}
                    {customersByCategory.enterprise > 0 && <div>Enterprise: {formatInt(customersByCategory.enterprise)}</div>}
                </div>
            </div>

            {/* ARPA */}
            <div className={styles.panel} style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>ARPA</h3>
                    <Info text="Average Revenue Per Account: L'incasso medio ricorrente per cliente (MRR Totale / Clienti Attivi)." />
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
                    {formatCurrency(kpis.arpa)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {formatDelta(kpis.arpaDelta.absolute, kpis.arpaDelta.percent)}
                </div>
            </div>
        </div>

        {/* Sezione 1: Controlli Globali */}
			<div style={{ marginBottom: 24 }}>
				<label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: 12 }}>
					<input
						type="checkbox"
						checked={showFilters}
						onChange={(e) => setShowFilters(e.target.checked)}
						style={{ cursor: 'pointer' }}
					/>
					<span style={{ color: 'var(--muted)' }}>Mostra filtri</span>
				</label>
				
				{showFilters && (
					<>
						{/* Prima riga: Date pickers e Presets */}
						<div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
							<label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
								<span style={{ color: 'var(--muted)' }}>Da</span>
								<input
									type="date"
									value={fromDate}
									onChange={(e) => setFromDate(e.target.value)}
									style={{
										padding: '6px 8px',
										background: 'var(--panel)',
										color: 'var(--text)',
										border: '1px solid rgba(255,255,255,0.12)',
										borderRadius: 6,
										fontSize: 14,
									}}
								/>
							</label>
							<label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
								<span style={{ color: 'var(--muted)' }}>A</span>
								<input
									type="date"
									value={toDate}
									onChange={(e) => setToDate(e.target.value)}
									style={{
										padding: '6px 8px',
										background: 'var(--panel)',
										color: 'var(--text)',
										border: '1px solid rgba(255,255,255,0.12)',
										borderRadius: 6,
										fontSize: 14,
									}}
								/>
							</label>
							<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
								{PRESETS.map((preset) => (
									<button
										key={preset.label}
										onClick={() => {
											if (preset.getRange) {
												const { from, to } = preset.getRange();
												setFromDate(from.toISOString().split('T')[0]);
												setToDate(to.toISOString().split('T')[0]);
											} else if (preset.days) {
												const to = new Date();
												const from = new Date();
												from.setDate(from.getDate() - preset.days);
												setFromDate(from.toISOString().split('T')[0]);
												setToDate(to.toISOString().split('T')[0]);
											}
										}}
										style={{
											padding: '6px 12px',
											background: 'var(--panel)',
											color: 'var(--text)',
											border: '1px solid rgba(255,255,255,0.12)',
											borderRadius: 6,
											cursor: 'pointer',
											fontSize: 13,
										}}
									>
										{preset.label}
									</button>
								))}
							</div>
						</div>
						
						{/* Seconda riga: Piano, Numero Spazi e checkbox esclusioni */}
						<div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
							<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
								<span style={{ color: 'var(--muted)', fontSize: 14 }}>Piano</span>
								<select
									value={selectedPlanTier}
									onChange={(e) => setSelectedPlanTier(e.target.value as 'all' | 'Basic' | 'Plus' | 'Enterprise')}
									style={{
										padding: '6px 8px',
										background: 'var(--panel)',
										color: 'var(--text)',
										border: '1px solid rgba(255,255,255,0.12)',
										borderRadius: 6,
										fontSize: 14,
									}}
								>
									<option value="all">Tutti i piani</option>
									<option value="Basic">Basic</option>
									<option value="Plus">Plus</option>
									<option value="Enterprise">Enterprise</option>
								</select>
							</div>
							
							<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
								<span style={{ color: 'var(--muted)', fontSize: 14 }}>Numero Spazi</span>
								<select
									value={selectedWebspacesCount}
									onChange={(e) => setSelectedWebspacesCount(e.target.value as 'all' | '1' | '5' | '15' | '25')}
									disabled={selectedPlanTier === 'Enterprise'}
									style={{
										padding: '6px 8px',
										background: selectedPlanTier === 'Enterprise' ? 'var(--panel)' : 'var(--panel)',
										color: selectedPlanTier === 'Enterprise' ? 'var(--muted)' : 'var(--text)',
										border: '1px solid rgba(255,255,255,0.12)',
										borderRadius: 6,
										fontSize: 14,
										cursor: selectedPlanTier === 'Enterprise' ? 'not-allowed' : 'pointer',
										opacity: selectedPlanTier === 'Enterprise' ? 0.5 : 1,
									}}
								>
									<option value="all">Tutti</option>
									<option value="1">1 spazio</option>
									<option value="5">5 spazi</option>
									<option value="15">15 spazi</option>
									<option value="25">25 spazi</option>
								</select>
							</div>
							
							<div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
								<label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
									<input
										type="checkbox"
										checked={excludeMonday}
										onChange={(e) => setExcludeMonday(e.target.checked)}
										style={{ cursor: 'pointer' }}
									/>
									<span style={{ color: 'var(--muted)' }}>Escludi Monday</span>
								</label>
								<label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
									<input
										type="checkbox"
										checked={excludeStripe}
										onChange={(e) => setExcludeStripe(e.target.checked)}
										style={{ cursor: 'pointer' }}
									/>
									<span style={{ color: 'var(--muted)' }}>Escludi Stripe</span>
								</label>
								<label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
									<input
										type="checkbox"
										checked={excludeRai}
										onChange={(e) => setExcludeRai(e.target.checked)}
										style={{ cursor: 'pointer' }}
									/>
									<span style={{ color: 'var(--muted)' }}>Escludi RAI</span>
								</label>
							</div>
						</div>
					</>
				)}
			</div>

			{/* Sezione 2: Area Grafico Principale */}
			<div className={styles.panel} style={{ marginBottom: 32, padding: 24 }}>
				<h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 18, fontWeight: 600 }}>Andamento Metrica</h2>
				<div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 8 }}>
					{(['mrr', 'customers', 'arpa'] as MetricTab[]).map((tab) => (
						<button
							key={tab}
							onClick={() => setSelectedTab(tab)}
							style={{
								padding: '8px 16px',
								border: 'none',
								borderBottom: selectedTab === tab ? '2px solid var(--primary-2)' : '2px solid transparent',
								background: 'transparent',
								cursor: 'pointer',
								fontWeight: selectedTab === tab ? 600 : 400,
								color: selectedTab === tab ? 'var(--primary-2)' : 'var(--muted)',
								fontSize: 14,
							}}
						>
							{tab === 'mrr' ? 'MRR' : tab === 'customers' ? 'Clienti Attivi' : 'ARPA'}
						</button>
					))}
				</div>
				<div style={{ height: 400 }}>
					<ResponsiveContainer width="100%" height="100%">
						<LineChart data={series}>
							<CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
							<XAxis dataKey="date" stroke="var(--muted)" style={{ fontSize: 12 }} />
							<YAxis
								domain={getYDomain(selectedTab === 'mrr' ? 'mrr' : selectedTab === 'customers' ? 'activeCustomers' : 'arpa')}
								tickFormatter={(v) => selectedTab === 'customers' ? String(Math.round(v)) : formatCurrency(v)}
								stroke="var(--muted)"
								style={{ fontSize: 12 }}
							/>
							<Tooltip
								contentStyle={{ background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
								formatter={(v: number) => selectedTab === 'customers' ? String(Math.round(v)) : formatCurrency(v)}
							/>
							<Line
								type="monotone"
								dataKey={selectedTab === 'mrr' ? 'mrr' : selectedTab === 'customers' ? 'activeCustomers' : 'arpa'}
								stroke="var(--primary-2)"
								strokeWidth={2}
								dot={false}
							/>
						</LineChart>
					</ResponsiveContainer>
				</div>
			</div>

			{/* Tabella Abbonamenti Filtrati */}
			{showFilters && (
				<div className={styles.panel} style={{ padding: 24, marginTop: 32 }}>
					<h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 18, fontWeight: 600 }}>
						Abbonamenti Attivi Filtrati ({activeSubscriptions.length})
					</h2>
					<div style={{ overflowX: 'auto' }}>
						<table className={styles.table} style={{ width: '100%' }}>
							<thead>
								<tr>
									<th style={{ width: '25%' }}>Email</th>
									<th style={{ width: '20%' }}>Piano</th>
									<th style={{ width: '15%' }}>Webspaces</th>
									<th style={{ width: '15%', textAlign: 'right' }}>MRR</th>
									<th style={{ width: '15%' }}>Data</th>
									<th style={{ width: '10%' }}>Fonte</th>
								</tr>
							</thead>
							<tbody>
								{activeSubscriptions.length === 0 ? (
									<tr>
										<td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>
											Nessun abbonamento trovato con i filtri selezionati
										</td>
									</tr>
								) : (
									activeSubscriptions.map((sub, idx) => {
										const tier = sub.subscriptionName?.toLowerCase().includes('basic') ? 'Basic' :
											sub.subscriptionName?.toLowerCase().includes('plus') ? 'Plus' :
											sub.subscriptionName?.toLowerCase().includes('enterprise') ? 'Enterprise' : 'Unknown';
										return (
											<tr key={`${sub.email}-${idx}`}>
												<td style={{ fontSize: 13 }}>{sub.email}</td>
												<td style={{ fontSize: 13 }}>{sub.subscriptionName}</td>
												<td style={{ fontSize: 13 }}>
													{tier === 'Enterprise' ? '-' : (sub.webspacesCount ?? 'N/A')}
												</td>
												<td style={{ fontSize: 13, textAlign: 'right' }}>
													{formatCurrency(sub.amountCents)}
												</td>
												<td style={{ fontSize: 13, color: 'var(--muted)' }}>
													{new Date(sub.date + 'T00:00:00Z').toLocaleDateString('it-IT')}
												</td>
												<td style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' }}>
													{sub.source}
												</td>
											</tr>
										);
									})
								)}
							</tbody>
						</table>
					</div>
				</div>
			)}

		</div>
	);
}

export default SlideHeadlineMetrics;
