import { useEffect, useState } from 'react';

export type EnterpriseAccount = {
  customerName: string | null;
  annualAmountCents: number | null;
  years: number[];
  renewalMonth: string | null;
  plan: string;
  interventionsEligible: boolean | null;
};

function dataUrl(): string {
  return '/src/data/avacy/json/monday/enterprise-accounts.json';
}

export function useEnterpriseAccounts() {
  const [data, setData] = useState<EnterpriseAccount[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(dataUrl())
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as EnterpriseAccount[];
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e as Error);
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

