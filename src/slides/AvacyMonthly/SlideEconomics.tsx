import React, { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { SlideTitle, Nav, SourceLabel } from '@components';
import styles from '../../components/DataTable.module.css';
import { useDashboardData } from '../../data/avacy/hooks/useDashboardData';
import { useFileLastModified } from '../../data/avacy/hooks/useFileLastModified';
import { PlanTier } from '../../data/avacy/types';

const COLORS: Record<PlanTier, string> = {
  Free: '#94a3b8',      // Slate 400
  Basic: '#60a5fa',     // Blue 400
  Plus: '#818cf8',      // Indigo 400
  Enterprise: '#f472b6',// Pink 400
  Unknown: '#333'
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100);
}

export function SlideEconomics() {
  const { data, loading, error } = useDashboardData();
  const [timeRange, setTimeRange] = useState<number>(90); // Default ultimi 90 giorni
  
  const sourceUrls = [
    'avacy/json/vapor/tenants.json',
    'avacy/json/stripe/new-subscriptions.json',
    'avacy/json/stripe/cancellations.json',
    'avacy/json/monday/new-subscriptions.json',
    'avacy/json/monday/cancellations.json'
  ];
  const lastUpdated = useFileLastModified(sourceUrls);

  const filteredHistory = useMemo(() => {
    if (!data) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - timeRange);
    return data.history.filter(h => new Date(h.date) >= cutoff);
  }, [data, timeRange]);

  // Preparazione dati per il grafico Stacked MRR
  const chartData = useMemo(() => {
    return filteredHistory.map(point => ({
      date: point.date,
      // MRR per piano (ricostruito moltiplicando count * price)
      mrrFree: 0,
      mrrBasic: point.breakdown.Basic * 1500, 
      mrrPlus: point.breakdown.Plus * 4900,
      mrrEnterprise: point.breakdown.Enterprise * 20000,
      
      countFree: point.breakdown.Free,
      countBasic: point.breakdown.Basic,
      countPlus: point.breakdown.Plus,
      countEnterprise: point.breakdown.Enterprise,
    }));
  }, [filteredHistory]);

  const topAccounts = useMemo(() => {
    if (!data) return [];
    return [...data.accounts]
      .sort((a, b) => b.mrr - a.mrr)
      .slice(0, 8);
  }, [data]);

  if (loading) return <div className="container"><div style={{ padding: 48, textAlign: 'center' }}>Caricamento...</div></div>;
  if (error) return <div className="container"><div style={{ padding: 48, textAlign: 'center', color: 'red' }}>Errore: {error.message}</div></div>;
  if (!data) return null;

  const lastPoint = data.history[data.history.length - 1];

  return (
    <div className="container">
      <header className="bar" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <SlideTitle>Economics & Growth</SlideTitle>
          <SourceLabel 
            label="Stripe + Monday + DB"
            sources={[
              { label: 'Tenants (DB)', url: 'data/avacy/json/vapor/tenants.json', lastUpdated: lastUpdated['avacy/json/vapor/tenants.json'] || undefined },
              { label: 'Stripe - Nuove Sottoscrizioni', url: 'data/avacy/json/stripe/new-subscriptions.json', lastUpdated: lastUpdated['avacy/json/stripe/new-subscriptions.json'] || undefined },
              { label: 'Stripe - Cancellazioni', url: 'data/avacy/json/stripe/cancellations.json', lastUpdated: lastUpdated['avacy/json/stripe/cancellations.json'] || undefined },
              { label: 'Monday - Nuove Sottoscrizioni', url: 'data/avacy/json/monday/new-subscriptions.json', lastUpdated: lastUpdated['avacy/json/monday/new-subscriptions.json'] || undefined },
              { label: 'Monday - Cancellazioni', url: 'data/avacy/json/monday/cancellations.json', lastUpdated: lastUpdated['avacy/json/monday/cancellations.json'] || undefined }
            ]}
          />
        </div>
        <Nav />
      </header>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className={styles.panel} style={{ padding: 16 }}>
          <h3 style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>MRR Attuale</h3>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{formatCurrency(lastPoint.mrr)}</div>
        </div>
        <div className={styles.panel} style={{ padding: 16 }}>
          <h3 style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Clienti Paganti</h3>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{lastPoint.activeSubscriptions}</div>
        </div>
        <div className={styles.panel} style={{ padding: 16 }}>
          <h3 style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Totale Tenant</h3>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{lastPoint.totalTenants}</div>
        </div>
        <div className={styles.panel} style={{ padding: 16 }}>
          <h3 style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>ARPU (Paganti)</h3>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
            {lastPoint.activeSubscriptions > 0 
              ? formatCurrency(lastPoint.mrr / lastPoint.activeSubscriptions) 
              : '€0'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, height: '400px' }}>
        
        {/* Grafico Principale: Stacked MRR */}
        <div className={styles.panel} style={{ padding: 20, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Composizione MRR per Piano</h3>
            <select 
              value={timeRange} 
              onChange={e => setTimeRange(Number(e.target.value))}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: 4, padding: '2px 6px' }}
            >
              <option value={30}>30 Giorni</option>
              <option value={90}>90 Giorni</option>
              <option value={365}>1 Anno</option>
            </select>
          </div>
          
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradBasic" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.Basic} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={COLORS.Basic} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gradPlus" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.Plus} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={COLORS.Plus} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gradEnterprise" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.Enterprise} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={COLORS.Enterprise} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#666" fontSize={12} tickFormatter={(d) => d.split('-').slice(1).join('/')} />
                <YAxis stroke="#666" fontSize={12} tickFormatter={(v) => `€${v/100}`} />
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }}
                  formatter={(val: number) => formatCurrency(val)}
                />
                <Area type="monotone" dataKey="mrrEnterprise" stackId="1" stroke={COLORS.Enterprise} fill="url(#gradEnterprise)" name="Enterprise" />
                <Area type="monotone" dataKey="mrrPlus" stackId="1" stroke={COLORS.Plus} fill="url(#gradPlus)" name="Plus" />
                <Area type="monotone" dataKey="mrrBasic" stackId="1" stroke={COLORS.Basic} fill="url(#gradBasic)" name="Basic" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Accounts Table */}
        <div className={styles.panel} style={{ padding: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600 }}>Top Clienti (per Valore)</h3>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 4px', color: 'var(--muted)' }}>Nome</th>
                  <th style={{ padding: '8px 4px', color: 'var(--muted)' }}>Piano</th>
                  <th style={{ padding: '8px 4px', color: 'var(--muted)', textAlign: 'right' }}>MRR</th>
                </tr>
              </thead>
              <tbody>
                {topAccounts.map(acc => (
                  <tr key={acc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px 4px' }}>
                      <div style={{ fontWeight: 500 }}>{acc.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{acc.usersCount} utenti, {acc.webspacesCount} siti</div>
                    </td>
                    <td style={{ padding: '8px 4px' }}>
                      <span style={{ 
                        padding: '2px 6px', 
                        borderRadius: 4, 
                        fontSize: 11, 
                        backgroundColor: COLORS[acc.plan] + '33', 
                        color: COLORS[acc.plan],
                        border: `1px solid ${COLORS[acc.plan]}66`
                      }}>
                        {acc.plan}
                      </span>
                    </td>
                    <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 600 }}>
                      {formatCurrency(acc.mrr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}



