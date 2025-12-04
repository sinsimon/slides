export function buildDataUrl(relativePath: string): string {
  const base = (import.meta.env?.BASE_URL ?? '/') as string;
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedPath = relativePath.replace(/^\/+/, '');
  return `${normalizedBase}${normalizedPath}`;
}

/**
 * Helper per fetch con cache-busting per evitare cache del browser/CloudFront
 * Usa solo la data (giorno) invece del timestamp completo, così il browser
 * ricarica i JSON una volta al giorno (allineato con l'esecuzione giornaliera dei pollers)
 */
export function fetchWithCacheBust(url: string): Promise<Response> {
  // Usa solo la data (YYYY-MM-DD) invece del timestamp completo
  // Questo permette al browser di ricaricare i JSON una volta al giorno
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const cacheBuster = `?d=${today}`;
  const urlWithBuster = url.includes('?') ? `${url}&d=${today}` : `${url}${cacheBuster}`;
  return fetch(urlWithBuster, {
    cache: 'no-cache',
    headers: {
      'Cache-Control': 'no-cache',
    },
  });
}

export async function loadJsonData<T>(relativePath: string): Promise<T> {
  const url = buildDataUrl(`data/${relativePath}`);
  const response = await fetchWithCacheBust(url);
  if (!response.ok) {
    throw new Error(`Failed to load JSON data from ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Ottiene la data di ultima modifica di un file JSON tramite HEAD request
 */
export async function getFileLastModified(relativePath: string): Promise<string | null> {
  try {
    const url = buildDataUrl(`data/${relativePath}`);
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) return null;
    
    const lastModified = response.headers.get('Last-Modified');
    if (lastModified) {
      return new Date(lastModified).toISOString();
    }
    
    // Fallback: se non c'è Last-Modified, prova a leggere il file e usare la data corrente
    // (per file locali che non hanno Last-Modified)
    return null;
  } catch (error) {
    console.warn(`Failed to get last modified for ${relativePath}:`, error);
    return null;
  }
}
