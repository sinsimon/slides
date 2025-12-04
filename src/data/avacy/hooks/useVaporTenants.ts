import { useEffect, useState } from 'react';
import { buildDataUrl, fetchWithCacheBust } from '../utils/assets';

export type VaporTenant = {
  id: string;
  name: string;
  email?: string;
  plan: string;
  hasOnlyTestMail?: boolean;
  webspaces?: { count: number; names: string | null };
  users?: { count: number };
  createdAt?: string;
};

const DATA_URL = buildDataUrl('data/avacy/json/vapor/tenants.json');

export function useVaporTenants() {
  const [tenants, setTenants] = useState<VaporTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchWithCacheBust(DATA_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // tenants.json è un array, non un oggetto payload { contacts: ... } come active campaign
        return (await res.json()) as VaporTenant[];
      })
      .then((payload) => {
        if (!cancelled) setTenants(payload);
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

  return { tenants, loading, error } as const;
}

