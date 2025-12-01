import { useEffect, useState } from 'react';
import { buildDataUrl } from '../utils/assets';

export type VaporTenantContact = {
  id: string;
  cdate: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  customFields?: Record<string, string>;
  [key: string]: any;
};

export type VaporTenantsPayload = {
  fetchedAt: string;
  total: number;
  fields: Array<{ id: string; title?: string; type?: string }>;
  contacts: VaporTenantContact[];
};

const DATA_URL = buildDataUrl('data/avacy/json/vapor/tenants.json');

export function useVaporTenants() {
  const [data, setData] = useState<VaporTenantsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(DATA_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as VaporTenantsPayload;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err as Error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error } as const;
}

