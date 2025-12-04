import { useEffect, useState } from 'react';
import { buildDataUrl, fetchWithCacheBust } from '../utils/assets';

export type ActiveCampaignContact = {
  id: string;
  cdate: string;
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  customFields?: Record<string, string>;
  [key: string]: any;
};

export type ActiveCampaignContactsPayload = {
  fetchedAt: string;
  total: number;
  fields: Array<{ id: string; title?: string; type?: string }>;
  contacts: ActiveCampaignContact[];
};

const DATA_URL = buildDataUrl('data/avacy/json/active-campaign/contacts.json');

export function useActiveCampaignContacts() {
  const [data, setData] = useState<ActiveCampaignContactsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchWithCacheBust(DATA_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as ActiveCampaignContactsPayload;
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
