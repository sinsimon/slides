import { useEffect, useState } from 'react';
import { buildDataUrl, fetchWithCacheBust } from '../utils/assets';

export type StripeCancellationPoint = {
	date: string;
	count: number;
	totalAmountCents: number;
	currency: string;
	cancellations: Array<{
		email?: string;
		subscriptionName?: string;
        amountCents?: number;
		canceledAt?: string;
		cancelAt?: string;
        currency?: string;
		metadata?: Record<string, string>;
		webspacesCount?: number; // Numero di webspaces estratto dal subscriptionName
	}>;
};

interface WrappedData<T> {
  data: T;
  lastUpdated?: string;
}

export function useCancellations() {
	const [data, setData] = useState<StripeCancellationPoint[] | null>(null);
	const [lastUpdated, setLastUpdated] = useState<string | undefined>(undefined);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		fetchWithCacheBust(buildDataUrl('data/avacy/json/stripe/cancellations.json'))
			.then(async (r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return (await r.json()) as WrappedData<StripeCancellationPoint[]> | StripeCancellationPoint[];
			})
			.then((resp) => {
				if (!cancelled) {
					const wrapped = resp as WrappedData<StripeCancellationPoint[]> | StripeCancellationPoint[];
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


