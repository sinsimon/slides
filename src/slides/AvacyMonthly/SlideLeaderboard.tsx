import React, { useMemo, useState } from 'react';
import { SlideTitle, Nav, SourceLabel } from '@components';
import { useLeaderboard } from '../../data/avacy/hooks/useLeaderboard';
import { useVaporTenants } from '../../data/avacy/hooks/useVaporTenants';
import { useFileLastModified } from '../../data/avacy/hooks/useFileLastModified';
import styles from '../../components/DataTable.module.css';

interface EnrichedEntry {
  rank: number;
  domain: string;
  visits: number;
  requestPercentage: string;
  monthKey: string;
  teamName: string;
  plan: string;
}

function formatMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const monthNum = parseInt(month, 10);
  const monthNames = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
  ];
  return `${monthNames[monthNum - 1]} ${year}`;
}

export const SlideLeaderboard: React.FC = () => {
  const { data: leaderboardRaw, loading: loadingLeaderboard } = useLeaderboard();
  const { tenants, loading: loadingTenants } = useVaporTenants();
  const [selectedMonth, setSelectedMonth] = useState<string | null>('all');
  
  const sourceUrls = ['avacy/json/vapor/leaderboard.json', 'avacy/json/vapor/tenants.json'];
  const lastUpdated = useFileLastModified(sourceUrls);

  const loading = loadingLeaderboard || loadingTenants;

  const dataByMonth = useMemo(() => {
    if (loading || !leaderboardRaw.length || !tenants.length) return {};

    // Mappa tenant_id -> tenant info per lookup veloce
    const tenantMap = new Map<string, { name: string; plan: string }>();
    tenants.forEach(t => {
      tenantMap.set(t.id, { name: t.name, plan: t.plan });
    });

    const grouped: Record<string, EnrichedEntry[]> = {};

    leaderboardRaw.forEach(entry => {
      const monthKey = `${entry.year}-${String(entry.month).padStart(2, '0')}`;
      
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }

      // Determina tenant info
      let tenantInfo = { name: 'Unknown', plan: '-' };
      const cleanDomain = entry.domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase();
      
      // Prima prova per tenant_id se disponibile
      if (entry.tenant_id) {
        const found = tenantMap.get(entry.tenant_id);
        if (found) {
          tenantInfo = found;
        }
      }
      
      // Se non trovato per tenant_id, prova matching dominio (anche se tenant_id esiste ma non matcha)
      if (tenantInfo.name === 'Unknown') {
        for (const t of tenants) {
          if (t.webspaces?.names) {
            const domains = t.webspaces.names.split(',').map(d => 
              d.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase()
            );
            if (domains.includes(cleanDomain)) {
              tenantInfo = { name: t.name, plan: t.plan };
              break;
            }
          }
        }
      }

      grouped[monthKey].push({
        rank: 0,
        domain: entry.domain,
        visits: entry.visits,
        requestPercentage: entry.request_percentage,
        monthKey,
        teamName: tenantInfo.name,
        plan: tenantInfo.plan
      });
    });

    // Assegna rank per ogni mese e ordina
    Object.keys(grouped).forEach(m => {
      grouped[m].sort((a, b) => b.visits - a.visits);
      grouped[m] = grouped[m].map((item, idx) => ({ ...item, rank: idx + 1 })).slice(0, 20);
    });

    return grouped;
  }, [leaderboardRaw, tenants, loading]);

  const months = Object.keys(dataByMonth).sort().reverse();
  
  // Calcola aggregazione "Tutti i mesi"
  const allMonthsData = useMemo(() => {
    if (loading || !leaderboardRaw.length || !tenants.length) return [];

    const tenantMap = new Map<string, { name: string; plan: string }>();
    tenants.forEach(t => {
      tenantMap.set(t.id, { name: t.name, plan: t.plan });
    });

    // Aggrega per dominio sommando le visite
    const domainMap = new Map<string, { visits: number; requestPercentage: number; tenantInfo: { name: string; plan: string } }>();
    
    leaderboardRaw.forEach(entry => {
      const cleanDomain = entry.domain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
      
      // Determina tenant info
      let tenantInfo = { name: 'Unknown', plan: '-' };
      if (entry.tenant_id) {
        const found = tenantMap.get(entry.tenant_id);
        if (found) {
          tenantInfo = found;
        } else {
          // Fallback: prova a matchare per dominio
          for (const t of tenants) {
            if (t.webspaces?.names) {
              const domains = t.webspaces.names.split(',').map(d => 
                d.trim().replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
              );
              if (domains.includes(cleanDomain)) {
                tenantInfo = { name: t.name, plan: t.plan };
                break;
              }
            }
          }
        }
      } else {
        // Nessun tenant_id: prova matching dominio
        for (const t of tenants) {
          if (t.webspaces?.names) {
            const domains = t.webspaces.names.split(',').map(d => 
              d.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase()
            );
            if (domains.includes(cleanDomain)) {
              tenantInfo = { name: t.name, plan: t.plan };
              break;
            }
          }
        }
      }

      const existing = domainMap.get(entry.domain);
      const requestPerc = parseFloat(entry.request_percentage) || 0;
      
      if (existing) {
        existing.visits += entry.visits;
        existing.requestPercentage += requestPerc;
      } else {
        domainMap.set(entry.domain, {
          visits: entry.visits,
          requestPercentage: requestPerc,
          tenantInfo
        });
      }
    });

    // Converti in array, ordina e prendi top 10
    const aggregated = Array.from(domainMap.entries()).map(([domain, data]) => ({
      rank: 0,
      domain,
      visits: data.visits,
      requestPercentage: data.requestPercentage.toFixed(2),
      monthKey: 'all',
      teamName: data.tenantInfo.name,
      plan: data.tenantInfo.plan
    }));

    aggregated.sort((a, b) => b.visits - a.visits);
    return aggregated.map((item, idx) => ({ ...item, rank: idx + 1 })).slice(0, 20);
  }, [leaderboardRaw, tenants, loading]);

  const currentMonth = selectedMonth === 'all' ? 'all' : (selectedMonth || months[0] || null);
  const displayData = currentMonth === 'all' 
    ? allMonthsData 
    : (currentMonth ? dataByMonth[currentMonth] : []);

  if (loading) {
    return (
      <div className="container">
        <header className="bar" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <SlideTitle>Siti Più Visitati</SlideTitle>
            <SourceLabel 
              label="DB di produzione"
              sources={[
                { label: 'Domain Leaderboard (DB)', url: 'data/avacy/json/vapor/leaderboard.json', lastUpdated: lastUpdated['avacy/json/vapor/leaderboard.json'] || undefined },
                { label: 'Tenants (DB)', url: 'data/avacy/json/vapor/tenants.json', lastUpdated: lastUpdated['avacy/json/vapor/tenants.json'] || undefined }
              ]}
            />
          </div>
          <Nav />
        </header>
        <div style={{ padding: 48, textAlign: 'center' }}>Caricamento…</div>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="bar" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <SlideTitle>Siti Più Visitati</SlideTitle>
          <SourceLabel 
            label="DB di produzione"
            sources={[
              { label: 'Domain Leaderboard (DB)', url: 'data/avacy/json/vapor/leaderboard.json', lastUpdated: lastUpdated['avacy/json/vapor/leaderboard.json'] || undefined },
              { label: 'Tenants (DB)', url: 'data/avacy/json/vapor/tenants.json', lastUpdated: lastUpdated['avacy/json/vapor/tenants.json'] || undefined }
            ]}
          />
        </div>
        <Nav />
      </header>

      <div style={{ marginBottom: 24 }}>
        <div className={styles.panel} style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <span style={{ color: 'var(--muted)' }}>Mese:</span>
              <select
                value={currentMonth || ''}
                onChange={(e) => setSelectedMonth(e.target.value || null)}
                style={{
                  padding: '6px 12px',
                  background: 'var(--panel)',
                  color: 'var(--text)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 6,
                  fontSize: 14,
                  cursor: 'pointer',
                  minWidth: 180,
                }}
              >
                <option value="all">Tutti i mesi</option>
                {months.map(month => (
                  <option key={month} value={month}>
                    {formatMonthKey(month)}
                  </option>
                ))}
              </select>
            </label>
            {currentMonth && (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {currentMonth === 'all' 
                  ? `${displayData.length} domini (somma di tutti i mesi)`
                  : `${displayData.length} domini nel mese selezionato`}
              </div>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {currentMonth === 'all'
              ? 'Top 20 domini per numero totale di visite (somma di tutti i mesi), incrociati con i dati dei tenant attivi.'
              : 'Top 20 domini per numero di visite nel mese selezionato, incrociati con i dati dei tenant attivi.'}
          </div>
        </div>
      </div>

      <div className={styles.panel} style={{ padding: 24 }}>
        <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 18, fontWeight: 600 }}>Top 20 Domini</h2>
        {displayData.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>Nessun dato disponibile per questo mese</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: '12px 8px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Rank</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Dominio</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--muted)', fontWeight: 600 }}>Visite</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--muted)', fontWeight: 600 }}>% Richieste</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Team</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Piano</th>
                </tr>
              </thead>
              <tbody>
                {displayData.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '12px 8px', fontWeight: 600 }}>{row.rank}</td>
                    <td style={{ padding: '12px 8px' }}>{row.domain}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {row.visits.toLocaleString('it-IT')}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {row.requestPercentage}%
                    </td>
                    <td style={{ padding: '12px 8px' }}>{row.teamName}</td>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{ 
                        padding: '2px 6px', 
                        borderRadius: 4, 
                        fontSize: 11, 
                        backgroundColor: row.plan === 'Enterprise' ? '#f472b633' : 
                                        row.plan === 'Plus' ? '#818cf833' : 
                                        row.plan === 'Basic' ? '#60a5fa33' : 
                                        '#94a3b833',
                        color: row.plan === 'Enterprise' ? '#f472b6' : 
                               row.plan === 'Plus' ? '#818cf8' : 
                               row.plan === 'Basic' ? '#60a5fa' : 
                               '#94a3b8',
                        border: `1px solid ${row.plan === 'Enterprise' ? '#f472b666' : 
                                        row.plan === 'Plus' ? '#818cf866' : 
                                        row.plan === 'Basic' ? '#60a5fa66' : 
                                        '#94a3b866'}`
                      }}>
                        {row.plan}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
