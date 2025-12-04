import { useEffect, useState } from 'react';
import { buildDataUrl, fetchWithCacheBust } from '../utils/assets';

export type RaiNewSubscriptionPoint = {
	date: string;
	count: number;
	totalAmountCents: number;
	currency: string;
	purchases: Array<{
		email?: string;
		subscriptionName?: string;
        amountCents?: number;
        currency?: string;
		metadata?: Record<string, string>;
        webspacesCount?: number;
	}>;
};

const DATA_URL = buildDataUrl('data/avacy/json/rai/new-subscriptions.json');

interface WrappedData<T> {
  data: T;
  lastUpdated?: string;
}

export function useRaiNewSubscriptions() {
	const [data, setData] = useState<RaiNewSubscriptionPoint[] | null>(null);
	const [lastUpdated, setLastUpdated] = useState<string | undefined>(undefined);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		fetchWithCacheBust(DATA_URL)
			.then(async (r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return (await r.json()) as WrappedData<RaiNewSubscriptionPoint[]> | RaiNewSubscriptionPoint[];
			})
			.then((resp) => {
				if (!cancelled) {
					const wrapped = resp as WrappedData<RaiNewSubscriptionPoint[]> | RaiNewSubscriptionPoint[];
					const d = Array.isArray(wrapped) ? wrapped : wrapped.data;
					const updated = Array.isArray(wrapped) ? undefined : wrapped.lastUpdated;
					setData(d);
					setLastUpdated(updated);
				}
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

	return { data, loading, error, lastUpdated } as const;
}

