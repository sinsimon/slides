import { useEffect, useState } from 'react';
import { buildDataUrl } from '../utils/assets';

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
	}>;
};

export function useCancellations() {
	const [data, setData] = useState<StripeCancellationPoint[] | null>(null);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		fetch(buildDataUrl('data/avacy/json/stripe/cancellations.json'))
			.then(async (r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return (await r.json()) as StripeCancellationPoint[];
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


