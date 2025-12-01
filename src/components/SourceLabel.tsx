import React, { useState } from 'react';
import { buildDataUrl } from '../data/avacy/utils/assets';

interface SourceLabelProps {
  label: string;
  sources: Array<{ label: string; url: string; lastUpdated?: string }>;
}

async function downloadFile(url: string, filename: string) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error('Errore nel download:', error);
    // Fallback: apri in nuova tab
    window.open(url, '_blank');
  }
}

export function SourceLabel({ label, sources }: SourceLabelProps) {
  const [open, setOpen] = useState(false);

  // Trova la data di ultimo aggiornamento più recente
  const lastUpdatedDates = sources
    .map(s => s.lastUpdated)
    .filter(Boolean)
    .map(d => new Date(d!))
    .filter(d => !isNaN(d.getTime()));
  
  const mostRecentUpdate = lastUpdatedDates.length > 0
    ? new Date(Math.max(...lastUpdatedDates.map(d => d.getTime())))
    : null;

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block', fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
      <span 
        onClick={() => setOpen(!open)}
        style={{ cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
      >
        (fonte: {label}
        {mostRecentUpdate && ` • aggiornato ${formatDate(mostRecentUpdate)}`})
      </span>
      
      {open && (
        <>
          <div 
            style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 100 }} 
            onClick={() => setOpen(false)} 
          />
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 6,
            padding: '4px 0',
            zIndex: 101,
            minWidth: 200,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
          }}>
            <div style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Scarica Dati Grezzi</div>
            {sources.map((s, i) => {
              const url = buildDataUrl(s.url);
              const filename = s.url.split('/').pop() || 'data.json';
              return (
                <button
                  key={i}
                  onClick={() => {
                    downloadFile(url, filename);
                    setOpen(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: '#f8fafc',
                    textDecoration: 'none',
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'background 0.1s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#334155'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

