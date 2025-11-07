import React, { useMemo, useState } from 'react';
import { marked } from 'marked';
import { SlideTitle, Nav } from '@components';
import styles from '../../components/DataTable.module.css';

type MarkdownEntry = {
  id: string;
  title: string;
  content: string;
};

type CombinedEntry = {
  id: string;
  title: string;
  collaborations?: MarkdownEntry;
  developments?: MarkdownEntry;
};

const collaborationNotes = import.meta.glob('../../data/avacy/md/collaborations/*.md', {
  eager: true,
  import: 'default',
  query: '?raw',
});

const developmentNotes = import.meta.glob('../../data/avacy/md/developments/*.md', {
  eager: true,
  import: 'default',
  query: '?raw',
});

function parseFrontMatter(raw: string, id: string): MarkdownEntry {
  let title = id;
  let body = raw;

  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3);
    if (end !== -1) {
      const frontMatter = raw.slice(3, end).trim();
      body = raw.slice(end + 4).replace(/^\s+/, '');
      frontMatter.split(/\r?\n/).forEach((line) => {
        const [key, ...rest] = line.split(':');
        if (!key || rest.length === 0) return;
        const value = rest.join(':').trim();
        if (key.trim().toLowerCase() === 'title' && value) {
          title = value;
        }
      });
    }
  }

  return { id, title, content: body };
}

function buildEntries(rawMap: Record<string, string | undefined>): MarkdownEntry[] {
  return Object.entries(rawMap).map(([path, raw]) => {
    const filename = path.split('/').pop() ?? path;
    return parseFrontMatter((raw ?? '') as string, filename);
  });
}

const collaborationEntries = buildEntries(collaborationNotes);
const developmentEntries = buildEntries(developmentNotes);

const combinedMap = new Map<string, CombinedEntry>();

collaborationEntries.forEach((entry) => {
  combinedMap.set(entry.id, { id: entry.id, title: entry.title, collaborations: entry });
});

developmentEntries.forEach((entry) => {
  const existing = combinedMap.get(entry.id);
  if (existing) {
    const title = existing.title || entry.title;
    combinedMap.set(entry.id, { ...existing, title, developments: entry });
  } else {
    combinedMap.set(entry.id, { id: entry.id, title: entry.title, developments: entry });
  }
});

const ENTRIES: CombinedEntry[] = Array.from(combinedMap.values()).sort((a, b) => a.title.localeCompare(b.title, 'it'));

export function SlideCollaborations() {
  const [selectedId, setSelectedId] = useState(() => ENTRIES[ENTRIES.length - 1]?.id ?? '');

  const selected = useMemo(() => ENTRIES.find((entry) => entry.id === selectedId) ?? ENTRIES[0], [selectedId]);

  const collaborationHtml = useMemo(() => {
    if (!selected?.collaborations) return '';
    return marked.parse(selected.collaborations.content, { breaks: true });
  }, [selected?.collaborations]);

  const developmentHtml = useMemo(() => {
    if (!selected?.developments) return '';
    return marked.parse(selected.developments.content, { breaks: true });
  }, [selected?.developments]);

  if (!selected) {
    return (
      <div className="container">
        <header className="bar" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <SlideTitle>Collaborazioni e Sviluppi</SlideTitle>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>(fonte: note interne)</div>
          </div>
          <Nav />
        </header>
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>Nessun contenuto disponibile</div>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="bar" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <SlideTitle>Collaborazioni e Sviluppi</SlideTitle>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>(fonte: note interne)</div>
        </div>
        <Nav />
      </header>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, maxWidth: 320 }}>
          <span style={{ color: 'var(--muted)' }}>Allineamento</span>
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            style={{
              padding: '6px 8px',
              background: 'var(--panel)',
              color: 'var(--text)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6,
              fontSize: 14,
            }}
          >
            {ENTRIES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: 'grid', gap: 24 }}>
        <div className={styles.panel} style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 18, fontWeight: 600 }}>Collaborazioni attive e feedback clienti</h2>
          {collaborationHtml ? (
            <article
              style={{ display: 'flex', flexDirection: 'column', gap: 16, color: 'var(--text)' }}
              dangerouslySetInnerHTML={{ __html: collaborationHtml }}
            />
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Nessuna nota per questo periodo.</div>
          )}
        </div>

        <div className={styles.panel} style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 18, fontWeight: 600 }}>Sviluppi attivi / in corso / pianificati</h2>
          {developmentHtml ? (
            <article
              style={{ display: 'flex', flexDirection: 'column', gap: 16, color: 'var(--text)' }}
              dangerouslySetInnerHTML={{ __html: developmentHtml }}
            />
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Nessuna nota per questo periodo.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SlideCollaborations;

