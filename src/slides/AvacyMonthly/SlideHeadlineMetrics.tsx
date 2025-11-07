import React, { useMemo, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { SlideTitle, Nav } from '@components';
import styles from '../../components/DataTable.module.css';
import { useNewSubscriptions } from '../../data/avacy/hooks/useNewSubscriptions';
import { useCancellations } from '../../data/avacy/hooks/useCancellations';
import { useMondayNewSubscriptions } from '../../data/avacy/hooks/useMondayNewSubscriptions';
import { useMondayCancellations } from '../../data/avacy/hooks/useMondayCancellations';
import { calculateMetrics, filterDataByPlans, type DateRange } from '../../data/avacy/utils/metrics';

type MetricTab = 'mrr' | 'customers' | 'arpa' | 'netNew';

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

export function SlideHeadlineMetrics() {
	const { data: newSubs, loading: loadingNew } = useNewSubscriptions();
	const { data: cancellations, loading: loadingCanc } = useCancellations();
	const { data: mondayNewSubs, loading: loadingMondayNew } = useMondayNewSubscriptions();
	const { data: mondayCancellations, loading: loadingMondayCanc } = useMondayCancellations();
	const [selectedPlans, setSelectedPlans] = useState<string[] | null>(null); // null = tutte
	const [excludeMonday, setExcludeMonday] = useState<boolean>(false);
	const [excludeStripe, setExcludeStripe] = useState<boolean>(false);
	const [selectedTab, setSelectedTab] = useState<MetricTab>('mrr');
	const [fromDate, setFromDate] = useState<string>(() => {
		const d = new Date();
		d.setDate(d.getDate() - 30);
		return d.toISOString().split('T')[0];
	});
	const [toDate, setToDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

	const range: DateRange = useMemo(() => ({
		from: new Date(fromDate + 'T00:00:00Z'),
		to: new Date(toDate + 'T23:59:59Z'),
	}), [fromDate, toDate]);

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
	}, [newSubs, cancellations, mondayNewSubs, mondayCancellations]);

	const { series, kpis } = useMemo(() => {
		if (!newSubs || !cancellations) return { series: [], kpis: null };
		
		// Applica filtri per fonte dati
		const filteredNewSubs = excludeStripe ? [] : newSubs;
		const filteredCancellations = excludeStripe ? [] : cancellations;
		const filteredMondayNewSubs = excludeMonday ? null : mondayNewSubs;
		const filteredMondayCancellations = excludeMonday ? null : mondayCancellations;
		
		const filtered = filterDataByPlans(filteredNewSubs, filteredCancellations, selectedPlans);
		return calculateMetrics(filtered.newSubs, filtered.cancellations, range, filteredMondayNewSubs, filteredMondayCancellations);
	}, [newSubs, cancellations, selectedPlans, range, mondayNewSubs, mondayCancellations, excludeMonday, excludeStripe]);

	// Calcola clienti attivi per categoria alla fine del periodo
	const customersByCategory = useMemo(() => {
		if (!newSubs || !cancellations || !kpis) return { basic: 0, plus: 0, enterprise: 0 };
		
		// Per la card vogliamo il breakdown complessivo alla data "to",
		// indipendente dal filtro piano selezionato nella tendina.
		const toDate = range.to;
		
		// Traccia abbonamenti attivi per cliente e categoria
		// customerEmail -> Set di categorie attive
		const customerCategories: Record<string, Set<string>> = {};
		
		// Aggiungi nuovi abbonamenti fino a "to" (Stripe) - solo se non escluso
		if (!excludeStripe) {
			for (const point of newSubs) {
				const pointDate = new Date(point.date + 'T00:00:00Z');
				if (pointDate > toDate) continue;
				
				for (const purchase of point.purchases) {
					if (!purchase.email || !purchase.subscriptionName) continue;
					if (!customerCategories[purchase.email]) {
						customerCategories[purchase.email] = new Set();
					}
					const lower = purchase.subscriptionName.toLowerCase();
					if (lower.includes('basic')) {
						customerCategories[purchase.email].add('basic');
					} else if (lower.includes('plus')) {
						customerCategories[purchase.email].add('plus');
					} else if (lower.includes('premium') || lower.includes('enterprise')) {
						customerCategories[purchase.email].add('enterprise');
					}
				}
			}
		}
		
		// Aggiungi nuovi abbonamenti fino a "to" (Monday) - solo se non escluso
		if (!excludeMonday && mondayNewSubs) {
			for (const point of mondayNewSubs) {
				const pointDate = new Date(point.date + 'T00:00:00Z');
				if (pointDate > toDate) continue;
				
				for (const purchase of point.purchases) {
					if (!purchase.email || !purchase.subscriptionName) continue;
					if (!customerCategories[purchase.email]) {
						customerCategories[purchase.email] = new Set();
					}
					const lower = purchase.subscriptionName.toLowerCase();
					if (lower.includes('enterprise')) {
						customerCategories[purchase.email].add('enterprise');
					}
				}
			}
		}
		
		// Rimuovi cancellazioni fino a "to" - Stripe
		if (!excludeStripe) {
			for (const point of cancellations) {
				const pointDate = new Date(point.date + 'T00:00:00Z');
				if (pointDate > toDate) continue;
				
				for (const cancel of point.cancellations) {
					if (!cancel.email || !cancel.subscriptionName) continue;
					if (customerCategories[cancel.email]) {
						const lower = cancel.subscriptionName.toLowerCase();
						let category = '';
						if (lower.includes('basic')) {
							category = 'basic';
						} else if (lower.includes('plus')) {
							category = 'plus';
						} else if (lower.includes('premium') || lower.includes('enterprise')) {
							category = 'enterprise';
						}
						if (category) {
							customerCategories[cancel.email].delete(category);
							if (customerCategories[cancel.email].size === 0) {
								delete customerCategories[cancel.email];
							}
						}
					}
				}
			}
		}
		
		// Rimuovi cancellazioni fino a "to" - Monday
		if (!excludeMonday && mondayCancellations) {
			for (const point of mondayCancellations) {
				const pointDate = new Date(point.date + 'T00:00:00Z');
				if (pointDate > toDate) continue;
				
				for (const cancel of point.cancellations) {
					if (!cancel.email || !cancel.subscriptionName) continue;
					if (customerCategories[cancel.email]) {
						const lower = cancel.subscriptionName.toLowerCase();
						if (lower.includes('enterprise')) {
							customerCategories[cancel.email].delete('enterprise');
							if (customerCategories[cancel.email].size === 0) {
								delete customerCategories[cancel.email];
							}
						}
					}
				}
			}
		}
		
		// Conta clienti per categoria
		let basic = 0, plus = 0, enterprise = 0;
		for (const categories of Object.values(customerCategories)) {
			if (categories.has('basic')) basic++;
			if (categories.has('plus')) plus++;
			if (categories.has('enterprise')) enterprise++;
		}
		
		return { basic, plus, enterprise };
	}, [newSubs, cancellations, mondayNewSubs, mondayCancellations, range, kpis, excludeMonday, excludeStripe]);

	const selectValue = useMemo(() => {
		if (selectedPlans === null) return 'ALL';
		if (selectedPlans.length === planCategories.basic.length && 
			planCategories.basic.length > 0 &&
			selectedPlans.every(p => planCategories.basic.includes(p))) {
			return 'CAT:BASIC';
		}
		if (selectedPlans.length === planCategories.plus.length && 
			planCategories.plus.length > 0 &&
			selectedPlans.every(p => planCategories.plus.includes(p))) {
			return 'CAT:PLUS';
		}
		if (selectedPlans.length === planCategories.premium.length && 
			planCategories.premium.length > 0 &&
			selectedPlans.every(p => planCategories.premium.includes(p))) {
			return 'CAT:PREMIUM';
		}
		if (selectedPlans.length === 1) return selectedPlans[0];
		return 'ALL';
	}, [selectedPlans, planCategories]);

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

	const loading = loadingNew || loadingCanc || loadingMondayNew || loadingMondayCanc;

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
					<div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>(fonte: Stripe / Monday)</div>
				</div>
				<Nav />
			</header>

        {/* Sezione 0: KPI Cards in alto */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {/* MRR Totale */}
            <div className={styles.panel} style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>MRR Totale</h3>
                    <Info text="Monthly Recurring Revenue: Il fatturato ricorrente mensile normalizzato da tutti gli abbonamenti attivi." />
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

            {/* Net New MRR */}
            <div className={styles.panel} style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>Net New MRR</h3>
                    <Info text="Net New MRR: La crescita (o perdita) netta dell'MRR nel periodo selezionato. Formula: (New MRR + Expansion MRR) - (Churn MRR + Contraction MRR)." />
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
                    {formatCurrency(kpis.netNewMrr)}
                </div>
            </div>
        </div>

        {/* Sezione 1: Controlli Globali */}
			<div style={{ marginBottom: 24 }}>
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
				
				{/* Seconda riga: Piano e checkbox esclusioni */}
				<div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
					<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
						<span style={{ color: 'var(--muted)', fontSize: 14 }}>Piano</span>
						<select
							value={selectValue}
							onChange={(e) => {
								const v = e.target.value;
								if (v === 'ALL') {
									setSelectedPlans(null);
								} else if (v === 'CAT:BASIC') {
									setSelectedPlans(planCategories.basic.length > 0 ? planCategories.basic : null);
								} else if (v === 'CAT:PLUS') {
									setSelectedPlans(planCategories.plus.length > 0 ? planCategories.plus : null);
								} else if (v === 'CAT:PREMIUM') {
									setSelectedPlans(planCategories.premium.length > 0 ? planCategories.premium : null);
								} else {
									setSelectedPlans([v]);
								}
							}}
							style={{
								padding: '6px 8px',
								background: 'var(--panel)',
								color: 'var(--text)',
								border: '1px solid rgba(255,255,255,0.12)',
								borderRadius: 6,
								fontSize: 14,
							}}
						>
							<option value="ALL">Tutti i piani</option>
							{planCategories.basic.length > 0 && <option value="CAT:BASIC">Tutti i Basic</option>}
							{planCategories.plus.length > 0 && <option value="CAT:PLUS">Tutti i Plus</option>}
							{planCategories.premium.length > 0 && <option value="CAT:PREMIUM">Tutti i Premium</option>}
							{allPlans.map((p) => (
								<option key={p} value={p}>{p} ({planCounts[p] || 0})</option>
							))}
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
					</div>
				</div>
			</div>

			{/* Sezione 2: Area Grafico Principale */}
			<div className={styles.panel} style={{ marginBottom: 32, padding: 24 }}>
				<h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 18, fontWeight: 600 }}>Andamento Metrica</h2>
				<div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: 8 }}>
					{(['mrr', 'customers', 'arpa', 'netNew'] as MetricTab[]).map((tab) => (
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
							{tab === 'mrr' ? 'MRR' : tab === 'customers' ? 'Clienti Attivi' : tab === 'arpa' ? 'ARPA' : 'Net New MRR'}
						</button>
					))}
				</div>
				<div style={{ height: 400 }}>
					{selectedTab === 'netNew' ? (
						<ResponsiveContainer width="100%" height="100%">
							<BarChart data={series}>
								<CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
								<XAxis dataKey="date" stroke="var(--muted)" style={{ fontSize: 12 }} />
								<YAxis domain={getYDomain('netNewMrr')} tickFormatter={(v) => formatCurrency(v)} stroke="var(--muted)" style={{ fontSize: 12 }} />
								<Tooltip
									contentStyle={{ background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
									formatter={(v: number) => formatCurrency(v)}
								/>
								<Bar dataKey="netNewMrr" fill="var(--primary-2)" />
							</BarChart>
						</ResponsiveContainer>
					) : (
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
					)}
				</div>
			</div>


		</div>
	);
}

export default SlideHeadlineMetrics;
