import { useEffect, useState } from 'react';
import { buildDataUrl } from '../utils/assets';

export type StripeNewSubscriptionPoint = {
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
	}>;
};

const DATA_URL = buildDataUrl('data/avacy/json/stripe/new-subscriptions.json');

export function useNewSubscriptions() {
	const [data, setData] = useState<StripeNewSubscriptionPoint[] | null>(null);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		fetch(DATA_URL)
			.then(async (r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return (await r.json()) as StripeNewSubscriptionPoint[];
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
