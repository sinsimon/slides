import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { SlideTitle, Nav, SourceLabel } from '@components';
import styles from '../../components/DataTable.module.css';
import { useUsersFunnel } from '../../data/avacy/hooks/useUsersFunnel';

function parseDate(dateStr: string): Date | null {
	if (!dateStr) return null;
	try {
		const cleaned = dateStr.trim();
		if (cleaned.includes('T')) {
			return new Date(cleaned);
		}
		return new Date(cleaned + 'T00:00:00Z');
	} catch {
		return null;
	}
}

type FunnelStep = 'registered' | 'hasTenant' | 'hasWebspace' | 'isNonFree';

type TenantExample = {
	tenantId: string | null;
	tenantName?: string | null;
	tenantMemberCount?: number | null;
	plan?: string | null;
	domain?: string | null;
	domainCount?: number | null;
	emails: string[]; // Array di email per questo tenant
};

export function SlideUserFunnel() {
	const { data, loading, error } = useUsersFunnel();
	const [showDateFilter, setShowDateFilter] = useState(false);
	const [fromDate, setFromDate] = useState(() => {
		const d = new Date();
		d.setUTCDate(d.getUTCDate() - 30);
		return d.toISOString().split('T')[0];
	});
	const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
	const [expandedSteps, setExpandedSteps] = useState<Set<FunnelStep>>(new Set());
	const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set()); // Set di chiavi "email|tenantId"

	const range = useMemo(
		() => {
			if (!showDateFilter) {
				// Se il filtro è nascosto, usa tutti i dati
				return null;
			}
			return {
				from: new Date(`${fromDate}T00:00:00Z`),
				to: new Date(`${toDate}T23:59:59Z`),
			};
		},
		[fromDate, toDate, showDateFilter]
	);

	const extractDomain = (raw?: string | null): string | null => {
		if (!raw) return null;
		const tokens = raw
			.split(/[;,\n]/)
			.map((token) => token.trim())
			.filter(Boolean);
		if (tokens.length === 0) return null;
		
		// Prendi il primo dominio e rimuovi il protocollo se presente
		let domain = tokens[0];
		// Rimuovi https:// o http://
		domain = domain.replace(/^https?:\/\//i, '');
		// Rimuovi eventuali trailing slash
		domain = domain.replace(/\/$/, '');
		
		return domain || null;
	};

	const countDomains = (raw?: string | null): number => {
		if (!raw) return 0;
		const tokens = raw
			.split(/[;,\n]/)
			.map((token) => token.trim())
			.filter(Boolean);
		return tokens.length;
	};

	const { metrics, chartData, examplesByStep } = useMemo(() => {
		if (!data) {
			return {
				metrics: {
					total: 0,
					withTenant: 0,
					withWebspace: 0,
					nonFree: 0,
					tenantConversion: 0,
					webspaceConversion: 0,
					nonFreeConversion: 0,
				},
				chartData: [],
				examplesByStep: {
					registered: [],
					hasTenant: [],
					hasWebspace: [],
					isNonFree: [],
				},
			};
		}

		// Filtra tenant se il filtro data è attivo
		let tenantsInRange = data.tenants;
		if (range) {
			tenantsInRange = data.tenants.filter((tenant) => {
				const registeredAt = parseDate(tenant.registeredAt);
				if (!registeredAt) return false;
				return registeredAt >= range.from && registeredAt <= range.to;
			});
		}

		// Per le metriche, usiamo le statistiche dal JSON che contano gli utenti (per coerenza con il funnel)
		// Il funnel è basato su azioni degli utenti, ma nella visualizzazione mostriamo tenant come unità principale
		const total = data.stats.total; // Totale utenti registrati
		const withTenant = data.stats.hasTenant; // Utenti con tenant
		const withWebspace = data.stats.hasWebspace; // Utenti con webspace
		const nonFree = data.stats.isNonFree; // Utenti non free

		const tenantConversion = total > 0 ? (withTenant / total) * 100 : 0;
		const webspaceConversion = total > 0 ? (withWebspace / total) * 100 : 0;
		const nonFreeConversion = total > 0 ? (nonFree / total) * 100 : 0;

		// Trova esempi di tenant che si sono fermati a ogni step
		const registeredButNoTenant = tenantsInRange.filter((t) => t.tenantId === null).slice(0, 20).map((t) => ({
			tenantId: t.tenantId,
			tenantName: t.tenantName,
			tenantMemberCount: t.tenantMemberCount,
			plan: t.plan,
			domain: extractDomain(t.domains),
			domainCount: countDomains(t.domains),
			emails: t.emails,
		}));
		const hasTenantButNoWebspace = tenantsInRange.filter((t) => t.tenantId !== null && !t.hasWebspace).slice(0, 20).map((t) => ({
			tenantId: t.tenantId,
			tenantName: t.tenantName,
			tenantMemberCount: t.tenantMemberCount,
			plan: t.plan,
			domain: extractDomain(t.domains),
			domainCount: countDomains(t.domains),
			emails: t.emails,
		}));
		const hasWebspaceButNotNonFree = tenantsInRange.filter((t) => t.hasWebspace && !t.isNonFree).slice(0, 20).map((t) => ({
			tenantId: t.tenantId,
			tenantName: t.tenantName,
			tenantMemberCount: t.tenantMemberCount,
			plan: t.plan,
			domain: extractDomain(t.domains),
			domainCount: countDomains(t.domains),
			emails: t.emails,
		}));
		const isNonFreeUsers = tenantsInRange.filter((t) => t.isNonFree).slice(0, 20).map((t) => ({
			tenantId: t.tenantId,
			tenantName: t.tenantName,
			tenantMemberCount: t.tenantMemberCount,
			plan: t.plan,
			domain: extractDomain(t.domains),
			domainCount: countDomains(t.domains),
			emails: t.emails,
		}));

		// Dati per il grafico funnel (BarChart verticale con larghezza proporzionale)
		const maxValue = total;
		const funnelSteps = [
			{ 
				name: 'Si registrano', 
				value: total, 
				width: 100, 
				color: '#8884d8',
				percentage: 100 
			},
			{ 
				name: 'Creano un Team', 
				value: withTenant, 
				width: total > 0 ? (withTenant / total) * 100 : 0, 
				color: '#82ca9d',
				percentage: tenantConversion 
			},
			{ 
				name: 'Aggiungono uno spazio', 
				value: withWebspace, 
				width: total > 0 ? (withWebspace / total) * 100 : 0, 
				color: '#ffc658',
				percentage: webspaceConversion 
			},
			{ 
				name: 'Attivano un piano a pagamento', 
				value: nonFree, 
				width: total > 0 ? (nonFree / total) * 100 : 0, 
				color: '#ff7300',
				percentage: nonFreeConversion 
			},
		];

		return {
			metrics: {
				total,
				withTenant,
				withWebspace,
				nonFree,
				tenantConversion,
				webspaceConversion,
				nonFreeConversion,
			},
			chartData: funnelSteps,
			examplesByStep: {
				registered: registeredButNoTenant,
				hasTenant: hasTenantButNoWebspace,
				hasWebspace: hasWebspaceButNotNonFree,
				isNonFree: isNonFreeUsers,
			},
		};
	}, [data, range]);

	const toggleExpand = (step: FunnelStep) => {
		setExpandedSteps((prev) => {
			const next = new Set(prev);
			if (next.has(step)) {
				next.delete(step);
			} else {
				next.add(step);
			}
			return next;
		});
	};

	const getTenantKey = (tenant: TenantExample): string => {
		return tenant.tenantId || tenant.emails[0] || '';
	};

	const toggleUserExpand = (tenant: TenantExample) => {
		const key = getTenantKey(tenant);
		setExpandedUsers((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	};

	const expandAllUsers = (tenants: TenantExample[]) => {
		const keys = tenants.map(getTenantKey);
		setExpandedUsers((prev) => {
			const next = new Set(prev);
			keys.forEach(key => next.add(key));
			return next;
		});
	};

	const collapseAllUsers = (tenants: TenantExample[]) => {
		const keys = tenants.map(getTenantKey);
		setExpandedUsers((prev) => {
			const next = new Set(prev);
			keys.forEach(key => next.delete(key));
			return next;
		});
	};

	const areAllExpanded = (tenants: TenantExample[]): boolean => {
		if (tenants.length === 0) return false;
		const keys = tenants.map(getTenantKey);
		return keys.every(key => expandedUsers.has(key));
	};

	const renderTenantItem = (tenant: TenantExample, idx: number) => {
		const tenantKey = getTenantKey(tenant);
		const isExpanded = expandedUsers.has(tenantKey);
		// Per tenant senza ID, mostra la prima email come identificatore principale
		const primaryEmail = tenant.emails[0] || 'N/A';
		const hasMultipleEmails = tenant.emails.length > 1;
		
		return (
			<li key={idx} style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, wordBreak: 'break-word' }}>
				<div 
					onClick={() => toggleUserExpand(tenant)}
					style={{ 
						display: 'flex', 
						alignItems: 'center', 
						gap: 8,
						cursor: 'pointer',
						padding: '4px',
						borderRadius: 4,
						transition: 'background-color 0.2s',
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.backgroundColor = 'transparent';
					}}
				>
					<div style={{
						padding: '2px 4px',
						color: 'var(--muted)',
						fontSize: 10,
						minWidth: 20,
						textAlign: 'center',
					}}>
						{isExpanded ? '−' : '+'}
					</div>
					<div style={{ flex: 1 }}>
						<div style={{ fontWeight: 500 }}>
							{tenant.tenantName || primaryEmail}
							{hasMultipleEmails && !isExpanded && (
								<span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 4 }}>
									(+{tenant.emails.length - 1} {tenant.emails.length - 1 === 1 ? 'altra' : 'altre'})
								</span>
							)}
						</div>
						{isExpanded && (
							<>
								{hasMultipleEmails && (
									<div style={{ color: 'var(--muted)', marginTop: 2, fontSize: 12 }}>
										Email: {tenant.emails.join(', ')}
									</div>
								)}
								{tenant.domain && (
									<div style={{ color: 'var(--muted)', marginTop: 2, fontSize: 12 }}>
										({tenant.domain}{tenant.domainCount && tenant.domainCount > 1 ? ` e altri ${tenant.domainCount - 1}` : ''})
									</div>
								)}
								{tenant.tenantName && tenant.tenantName.trim() && (
									<div style={{ color: 'var(--muted)', marginTop: 2, fontSize: 12 }}>Team: {tenant.tenantName}</div>
								)}
								{tenant.tenantMemberCount !== null && tenant.tenantMemberCount !== undefined && tenant.tenantMemberCount > 0 && (
									<div style={{ color: 'var(--muted)', marginTop: 2, fontSize: 12 }}>Persone: {tenant.tenantMemberCount}</div>
								)}
								{tenant.plan && tenant.plan.trim() && (
									<div style={{ color: 'var(--muted)', marginTop: 2, fontSize: 12 }}>Piano: {tenant.plan}</div>
								)}
							</>
						)}
					</div>
				</div>
			</li>
		);
	};

	if (loading) {
		return (
			<div className="container">
				<header className="bar" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
					<div>
						<SlideTitle>Percorso Utenti</SlideTitle>
						<SourceLabel 
							label="DB di produzione"
							sources={[
								{ label: 'Users Funnel (DB)', url: 'data/avacy/json/vapor/users-funnel.json' }
							]}
						/>
					</div>
					<Nav />
				</header>
				<div style={{ padding: 48, textAlign: 'center' }}>Caricamento…</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="container">
				<header className="bar" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
					<div>
						<SlideTitle>Percorso Utenti</SlideTitle>
						<SourceLabel 
							label="DB di produzione"
							sources={[
								{ label: 'Users Funnel (DB)', url: 'data/avacy/json/vapor/users-funnel.json' }
							]}
						/>
					</div>
					<Nav />
				</header>
				<div style={{ padding: 48, textAlign: 'center', color: 'var(--error)' }}>
					Errore nel caricamento dei dati: {error.message}
				</div>
			</div>
		);
	}

	if (!data) {
		return (
			<div className="container">
				<header className="bar" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
					<div>
						<SlideTitle>Percorso Utenti</SlideTitle>
						<SourceLabel 
							label="DB di produzione"
							sources={[
								{ label: 'Users Funnel (DB)', url: 'data/avacy/json/vapor/users-funnel.json' }
							]}
						/>
					</div>
					<Nav />
				</header>
				<div style={{ padding: 48, textAlign: 'center' }}>Nessun dato disponibile</div>
			</div>
		);
	}

	return (
		<div className="container">
			<header className="bar" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
				<div>
					<SlideTitle>Percorso Utenti</SlideTitle>
					<SourceLabel 
						label="DB di produzione"
						sources={[
							{ label: 'Users Funnel (DB)', url: 'data/avacy/json/vapor/users-funnel.json' }
						]}
					/>
				</div>
				<Nav />
			</header>

			<div style={{ marginBottom: 24 }}>
				<label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
					<input
						type="checkbox"
						checked={showDateFilter}
						onChange={(e) => setShowDateFilter(e.target.checked)}
						style={{ cursor: 'pointer' }}
					/>
					<span style={{ color: 'var(--muted)' }}>Filtra per data di registrazione</span>
				</label>
				{showDateFilter && (
					<div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
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
					</div>
				)}
			</div>

			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
				<div className={styles.panel} style={{ padding: 20 }}>
					<h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>Si registrano</h3>
					<div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{metrics.total.toLocaleString('it-IT')}</div>
				</div>
				<div className={styles.panel} style={{ padding: 20 }}>
					<h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>Creano un Team</h3>
					<div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{metrics.withTenant.toLocaleString('it-IT')}</div>
					<div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
						{metrics.tenantConversion.toFixed(1)}% conversione
					</div>
				</div>
				<div className={styles.panel} style={{ padding: 20 }}>
					<h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>Aggiungono uno spazio</h3>
					<div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{metrics.withWebspace.toLocaleString('it-IT')}</div>
					<div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
						{metrics.webspaceConversion.toFixed(1)}% conversione
					</div>
				</div>
				<div className={styles.panel} style={{ padding: 20 }}>
					<h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>Attivano un piano a pagamento</h3>
					<div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{metrics.nonFree.toLocaleString('it-IT')}</div>
					<div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
						{metrics.nonFreeConversion.toFixed(1)}% conversione
					</div>
				</div>
			</div>

			<div className={styles.panel} style={{ padding: 24, marginBottom: 24 }}>
				<h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 18, fontWeight: 600 }}>Funnel di Conversione</h2>
				{chartData.length === 0 || metrics.total === 0 ? (
					<div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
						Nessun utente registrato
					</div>
				) : (
					<div style={{ width: '100%', height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
						<div style={{ width: '100%', maxWidth: 600 }}>
							{chartData.map((step, index) => (
								<div
									key={step.name}
									style={{
										display: 'flex',
										alignItems: 'center',
										marginBottom: 16,
										gap: 16,
									}}
								>
									<div style={{ width: 180, fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
										{step.name}
									</div>
									<div style={{ flex: 1, position: 'relative' }}>
										<div
											style={{
												width: `${step.width}%`,
												height: 50,
												backgroundColor: step.color,
												borderRadius: 6,
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'center',
												color: 'white',
												fontWeight: 600,
												fontSize: 16,
												transition: 'width 0.3s ease',
											}}
										>
											{step.value.toLocaleString('it-IT')} ({step.percentage.toFixed(1)}%)
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				)}
			</div>

			<div className={styles.panel} style={{ padding: 24 }}>
				<h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 18, fontWeight: 600 }}>
					Esempi di utenti che si sono fermati agli step
				</h2>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
					{/* Si registrano ma non creano un Team */}
					<div>
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
							<h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>
								Si registrano ma non creano un Team
							</h3>
							{examplesByStep.registered.length > 0 && (() => {
								const visibleTenants = expandedSteps.has('registered') ? examplesByStep.registered : examplesByStep.registered.slice(0, 5);
								const allExpanded = areAllExpanded(visibleTenants);
								return (
									<button
										onClick={() => allExpanded ? collapseAllUsers(visibleTenants) : expandAllUsers(visibleTenants)}
										style={{
											padding: '2px 6px',
											background: 'transparent',
											color: 'var(--primary-2)',
											border: 'none',
											cursor: 'pointer',
											fontSize: 11,
											textDecoration: 'underline',
										}}
									>
										{allExpanded ? 'Comprimi tutti' : 'Espandi tutti'}
									</button>
								);
							})()}
						</div>
						{examplesByStep.registered.length === 0 ? (
							<div style={{ fontSize: 13, color: 'var(--muted)' }}>Nessun esempio</div>
						) : (
							<>
								<ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
									{(expandedSteps.has('registered') ? examplesByStep.registered : examplesByStep.registered.slice(0, 5)).map((tenant, idx) => renderTenantItem(tenant, idx))}
								</ul>
								{examplesByStep.registered.length > 5 && (
									<button
										onClick={() => toggleExpand('registered')}
										style={{
											marginTop: 8,
											padding: '4px 8px',
											background: 'transparent',
											color: 'var(--primary-2)',
											border: 'none',
											cursor: 'pointer',
											fontSize: 12,
											textDecoration: 'underline',
										}}
									>
										{expandedSteps.has('registered') ? 'Mostra meno' : `Mostra altri ${examplesByStep.registered.length - 5}`}
									</button>
								)}
							</>
						)}
					</div>

					{/* Creano un Team ma non aggiungono uno spazio */}
					<div>
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
							<h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>
								Creano un Team ma non aggiungono uno spazio
							</h3>
							{examplesByStep.hasTenant.length > 0 && (() => {
								const visibleTenants = expandedSteps.has('hasTenant') ? examplesByStep.hasTenant : examplesByStep.hasTenant.slice(0, 5);
								const allExpanded = areAllExpanded(visibleTenants);
								return (
									<button
										onClick={() => allExpanded ? collapseAllUsers(visibleTenants) : expandAllUsers(visibleTenants)}
										style={{
											padding: '2px 6px',
											background: 'transparent',
											color: 'var(--primary-2)',
											border: 'none',
											cursor: 'pointer',
											fontSize: 11,
											textDecoration: 'underline',
										}}
									>
										{allExpanded ? 'Comprimi tutti' : 'Espandi tutti'}
									</button>
								);
							})()}
						</div>
						{examplesByStep.hasTenant.length === 0 ? (
							<div style={{ fontSize: 13, color: 'var(--muted)' }}>Nessun esempio</div>
						) : (
							<>
								<ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
									{(expandedSteps.has('hasTenant') ? examplesByStep.hasTenant : examplesByStep.hasTenant.slice(0, 5)).map((tenant, idx) => renderTenantItem(tenant, idx))}
								</ul>
								{examplesByStep.hasTenant.length > 5 && (
									<button
										onClick={() => toggleExpand('hasTenant')}
										style={{
											marginTop: 8,
											padding: '4px 8px',
											background: 'transparent',
											color: 'var(--primary-2)',
											border: 'none',
											cursor: 'pointer',
											fontSize: 12,
											textDecoration: 'underline',
										}}
									>
										{expandedSteps.has('hasTenant') ? 'Mostra meno' : `Mostra altri ${examplesByStep.hasTenant.length - 5}`}
									</button>
								)}
							</>
						)}
					</div>

					{/* Aggiungono uno spazio ma non attivano un piano a pagamento */}
					<div>
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
							<h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>
								Aggiungono uno spazio ma non attivano un piano a pagamento
							</h3>
							{examplesByStep.hasWebspace.length > 0 && (() => {
								const visibleTenants = expandedSteps.has('hasWebspace') ? examplesByStep.hasWebspace : examplesByStep.hasWebspace.slice(0, 5);
								const allExpanded = areAllExpanded(visibleTenants);
								return (
									<button
										onClick={() => allExpanded ? collapseAllUsers(visibleTenants) : expandAllUsers(visibleTenants)}
										style={{
											padding: '2px 6px',
											background: 'transparent',
											color: 'var(--primary-2)',
											border: 'none',
											cursor: 'pointer',
											fontSize: 11,
											textDecoration: 'underline',
										}}
									>
										{allExpanded ? 'Comprimi tutti' : 'Espandi tutti'}
									</button>
								);
							})()}
						</div>
						{examplesByStep.hasWebspace.length === 0 ? (
							<div style={{ fontSize: 13, color: 'var(--muted)' }}>Nessun esempio</div>
						) : (
							<>
								<ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
									{(expandedSteps.has('hasWebspace') ? examplesByStep.hasWebspace : examplesByStep.hasWebspace.slice(0, 5)).map((tenant, idx) => renderTenantItem(tenant, idx))}
								</ul>
								{examplesByStep.hasWebspace.length > 5 && (
									<button
										onClick={() => toggleExpand('hasWebspace')}
										style={{
											marginTop: 8,
											padding: '4px 8px',
											background: 'transparent',
											color: 'var(--primary-2)',
											border: 'none',
											cursor: 'pointer',
											fontSize: 12,
											textDecoration: 'underline',
										}}
									>
										{expandedSteps.has('hasWebspace') ? 'Mostra meno' : `Mostra altri ${examplesByStep.hasWebspace.length - 5}`}
									</button>
								)}
							</>
						)}
					</div>

					{/* Attivano un piano a pagamento */}
					<div>
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
							<h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>
								Attivano un piano a pagamento
							</h3>
							{examplesByStep.isNonFree.length > 0 && (() => {
								const visibleTenants = expandedSteps.has('isNonFree') ? examplesByStep.isNonFree : examplesByStep.isNonFree.slice(0, 5);
								const allExpanded = areAllExpanded(visibleTenants);
								return (
									<button
										onClick={() => allExpanded ? collapseAllUsers(visibleTenants) : expandAllUsers(visibleTenants)}
										style={{
											padding: '2px 6px',
											background: 'transparent',
											color: 'var(--primary-2)',
											border: 'none',
											cursor: 'pointer',
											fontSize: 11,
											textDecoration: 'underline',
										}}
									>
										{allExpanded ? 'Comprimi tutti' : 'Espandi tutti'}
									</button>
								);
							})()}
						</div>
						{examplesByStep.isNonFree.length === 0 ? (
							<div style={{ fontSize: 13, color: 'var(--muted)' }}>Nessun esempio</div>
						) : (
							<>
								<ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
									{(expandedSteps.has('isNonFree') ? examplesByStep.isNonFree : examplesByStep.isNonFree.slice(0, 5)).map((tenant, idx) => renderTenantItem(tenant, idx))}
								</ul>
								{examplesByStep.isNonFree.length > 5 && (
									<button
										onClick={() => toggleExpand('isNonFree')}
										style={{
											marginTop: 8,
											padding: '4px 8px',
											background: 'transparent',
											color: 'var(--primary-2)',
											border: 'none',
											cursor: 'pointer',
											fontSize: 12,
											textDecoration: 'underline',
										}}
									>
										{expandedSteps.has('isNonFree') ? 'Mostra meno' : `Mostra altri ${examplesByStep.isNonFree.length - 5}`}
									</button>
								)}
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
