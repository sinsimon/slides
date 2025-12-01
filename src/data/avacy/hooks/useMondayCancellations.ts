import { useEffect, useState } from 'react';
import { buildDataUrl } from '../utils/assets';

export type MondayCancellationPoint = {
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
	}>;
};

const DATA_URL = buildDataUrl('data/avacy/json/monday/cancellations.json');

interface WrappedData<T> {
  data: T;
  lastUpdated?: string;
}

export function useMondayCancellations() {
	const [data, setData] = useState<MondayCancellationPoint[] | null>(null);
	const [lastUpdated, setLastUpdated] = useState<string | undefined>(undefined);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		fetch(DATA_URL)
			.then(async (r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return (await r.json()) as WrappedData<MondayCancellationPoint[]> | MondayCancellationPoint[];
			})
			.then((resp) => {
				if (!cancelled) {
					const wrapped = resp as WrappedData<MondayCancellationPoint[]> | MondayCancellationPoint[];
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

