import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SlideTitle, Nav } from '@components';
import styles from '../../components/DataTable.module.css';
import { useActiveCampaignContacts } from '../../data/avacy/hooks/useActiveCampaignContacts';

const PRESETS = [
  { label: 'Ultimi 30 giorni', days: 30 },
  {
    label: 'Mese Corrente',
    getRange: () => {
      const now = new Date();
      return {
        from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59)),
      };
    },
  },
  {
    label: 'Trimestre Corrente',
    getRange: () => {
      const now = new Date();
      const quarter = Math.floor(now.getUTCMonth() / 3);
      return {
        from: new Date(Date.UTC(now.getUTCFullYear(), quarter * 3, 1)),
        to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59)),
      };
    },
  },
  {
    label: 'Anno Corrente',
    getRange: () => {
      const now = new Date();
      return {
        from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
        to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59)),
      };
    },
  },
];

function getGranularity(from: Date, to: Date): 'day' | 'week' | 'month' {
  const diffDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
  if (diffDays > 365) return 'month';
  if (diffDays > 90) return 'week';
  return 'day';
}

function formatBucket(date: Date, granularity: 'day' | 'week' | 'month'): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (granularity === 'day') {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  if (granularity === 'month') {
    return `${year}-${String(month).padStart(2, '0')}`;
  }
  // week
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

type PlanKey = 'free' | 'basic' | 'plus' | 'none';

const COLORS: Record<PlanKey, string> = {
  free: '#1E90FF',
  basic: '#28a745',
  plus: '#ff9800',
  none: '#9e9e9e',
};

const PLAN_LABELS: Record<PlanKey, string> = {
  free: 'Account Free',
  basic: 'Account Basic',
  plus: 'Account Plus',
  none: 'Piano non specificato',
};

type AccountEntry = {
  id: string;
  name: string;
  domain?: string | null;
};

export function SlideNewAccounts() {
  const { data, loading } = useActiveCampaignContacts();
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);

  const range = useMemo(() => ({
    from: new Date(`${fromDate}T00:00:00Z`),
    to: new Date(`${toDate}T23:59:59Z`),
  }), [fromDate, toDate]);

  const { chartData, totals, accountsByPlan } = useMemo(() => {
    const buckets: Record<string, { free: number; basic: number; plus: number; none: number }> = {};
    const totalCounts = { registrations: 0, free: 0, basic: 0, plus: 0 };
    const accountsByPlan: Record<PlanKey, AccountEntry[]> = {
      free: [],
      basic: [],
      plus: [],
      none: [],
    };

    if (!data) return { chartData: [], totals: totalCounts, accountsByPlan };

    const granularity = getGranularity(range.from, range.to);
    const consumedAccounts = new Set<string>();

    const ensureBucket = (key: string) => {
      if (!buckets[key]) {
        buckets[key] = { free: 0, basic: 0, plus: 0, none: 0 };
      }
    };

    const extractName = (contactName: string | undefined, fallback: string): string => {
      const trimmed = (contactName || '').trim();
      return trimmed.length > 0 ? trimmed : fallback;
    };

    const extractDomain = (raw?: string): string | null => {
      if (!raw) return null;
      const tokens = raw
        .split(/[;,\n]/)
        .map((token) => token.trim())
        .filter(Boolean);
      return tokens.length > 0 ? tokens[0] : null;
    };

    (data.contacts || []).forEach((contact) => {
      const parsedDate = parseDate(contact.cdate);
      if (!parsedDate) return;
      if (parsedDate < range.from || parsedDate > range.to) return;

      const planRaw = contact.customFields?.['Abbonamento'] ?? '';
      const planValue = (planRaw || '').toString().trim().toLowerCase();
      let planKey: PlanKey = 'none';
      if (planValue.includes('free')) planKey = 'free';
      else if (planValue.includes('basic')) planKey = 'basic';
      else if (planValue.includes('plus')) planKey = 'plus';

      const bucketKey = formatBucket(parsedDate, granularity);
      ensureBucket(bucketKey);

      totalCounts.registrations += 1;
      if (planKey === 'free') {
        buckets[bucketKey].free += 1;
        totalCounts.free += 1;
      } else if (planKey === 'basic') {
        buckets[bucketKey].basic += 1;
        totalCounts.basic += 1;
      } else if (planKey === 'plus') {
        buckets[bucketKey].plus += 1;
        totalCounts.plus += 1;
      } else {
        buckets[bucketKey].none += 1;
      }

      const accountId = contact.id ?? contact.email ?? `${contact.firstName || ''}${contact.lastName || ''}`;
      if (!accountId) return;
      if (consumedAccounts.has(accountId)) return;

      const squadra = contact.customFields?.['Nome del Team'];
      const azienda = contact.customFields?.['Azienda'];
      const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
      const displayName = extractName(azienda, extractName(squadra, extractName(fullName, contact.email)));
      const domain = extractDomain(contact.customFields?.['Elenco domini']);

      accountsByPlan[planKey].push({
        id: accountId,
        name: displayName,
        domain,
      });
      consumedAccounts.add(accountId);
    });

    const orderedKeys: string[] = [];
    const seenKeys = new Set<string>();
    const cursor = new Date(range.from.getTime());
    while (cursor <= range.to) {
      const key = formatBucket(cursor, granularity);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        orderedKeys.push(key);
        ensureBucket(key);
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    // Mantieni l'ordinamento cronologico
    const cumulative = { free: 0, basic: 0, plus: 0, none: 0 };
    const chartData = orderedKeys.map((key) => {
      const bucket = buckets[key];
      cumulative.free += bucket.free;
      cumulative.basic += bucket.basic;
      cumulative.plus += bucket.plus;
      cumulative.none += bucket.none;
      return {
        date: key,
        free: cumulative.free,
        basic: cumulative.basic,
        plus: cumulative.plus,
        none: cumulative.none,
      };
    });

    (Object.keys(accountsByPlan) as PlanKey[]).forEach((plan) => {
      accountsByPlan[plan].sort((a, b) => a.name.localeCompare(b.name, 'it')); // ordina alfabeticamente
    });

    return {
      chartData: totalCounts.registrations === 0 ? [] : chartData,
      totals: totalCounts,
      accountsByPlan,
    };
  }, [data, range]);

  if (loading || !data) {
    return (
      <div className="container">
        <header className="bar" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <SlideTitle>Nuovi Account</SlideTitle>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>(fonte: ActiveCampaign)</div>
          </div>
          <Nav />
        </header>
        <div style={{ padding: 48, textAlign: 'center' }}>Caricamento…</div>
      </div>
    );
  }

  const granularity = getGranularity(range.from, range.to);
  const planEntries = Object.entries(accountsByPlan) as Array<[PlanKey, AccountEntry[]]>;
  const activePlanEntries = planEntries.filter(([, entries]) => entries.length > 0);
  const columnsToRender = activePlanEntries.length > 0 ? activePlanEntries : planEntries;

  return (
    <div className="container">
      <header className="bar" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <SlideTitle>Nuovi Account</SlideTitle>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>(fonte: ActiveCampaign)</div>
        </div>
        <Nav />
      </header>

      <div style={{ marginBottom: 24 }}>
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
                    from.setUTCDate(from.getUTCDate() - preset.days);
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
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className={styles.panel} style={{ padding: 20 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>Nuove registrazioni</h3>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{totals.registrations.toLocaleString('it-IT')}</div>
        </div>
        <div className={styles.panel} style={{ padding: 20 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>Nuovi Free</h3>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{totals.free.toLocaleString('it-IT')}</div>
        </div>
        <div className={styles.panel} style={{ padding: 20 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>Nuovi Basic</h3>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{totals.basic.toLocaleString('it-IT')}</div>
        </div>
        <div className={styles.panel} style={{ padding: 20 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>Nuovi Plus</h3>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{totals.plus.toLocaleString('it-IT')}</div>
        </div>
      </div>

      <div className={styles.panel} style={{ padding: 24 }}>
        <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 18, fontWeight: 600 }}>
          Andamento nuovi account ({granularity === 'day' ? 'giornaliero' : granularity === 'week' ? 'settimanale' : 'mensile'})
        </h2>
        {chartData.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>Nessun dato nel periodo selezionato</div>
        ) : (
          <div style={{ width: '100%', height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" stroke="var(--muted)" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} stroke="var(--muted)" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--panel)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)' }}
                  labelStyle={{ color: 'var(--muted)' }}
                />
                <Legend />
                <Line type="monotone" dataKey="free" stroke={COLORS.free} name="Account Free" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="basic" stroke={COLORS.basic} name="Account Basic" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="plus" stroke={COLORS.plus} name="Account Plus" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="none" stroke={COLORS.none} name="Registrazioni (piano vuoto)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className={styles.panel} style={{ padding: 24, marginTop: 24 }}>
        <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 18, fontWeight: 600 }}>Account entrati nel periodo</h2>
        {columnsToRender.every(([, entries]) => entries.length === 0) ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Nessun account registrato nel periodo selezionato</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columnsToRender.length}, minmax(0, 1fr))`, gap: 16 }}>
            {columnsToRender.map(([plan, entries]) => (
              <div key={plan} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>{PLAN_LABELS[plan]}</h3>
                {entries.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Nessun account</div>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {entries.map((entry) => (
                      <li key={entry.id} style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4, wordBreak: 'break-word' }}>
                        {entry.domain ? `${entry.name}: (${entry.domain})` : entry.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
