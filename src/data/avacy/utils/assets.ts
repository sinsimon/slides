export function buildDataUrl(relativePath: string): string {
  const base = (import.meta.env?.BASE_URL ?? '/') as string;
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedPath = relativePath.replace(/^\/+/, '');
  return `${normalizedBase}${normalizedPath}`;
}

