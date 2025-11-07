import { fetch } from 'undici';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import * as dotenv from 'dotenv';

// carica env dalla root (.env)
dotenv.config();

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

function getEnv(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`Missing env ${name}`);
	return v;
}

export async function fetchNewSubscriptions(): Promise<void> {
    const key = getEnv('STRIPE_API_KEY');
    // Data di inizio hardcoded
    const fromIso = '2020-01-01';
    const last365 = new Date(`${fromIso}T00:00:00Z`);

	const url = new URL('https://api.stripe.com/v1/subscriptions');
	url.searchParams.set('status', 'active');
	url.searchParams.set('limit', '100');
    url.searchParams.set('created[gte]', String(Math.floor(last365.getTime() / 1000)));
	// espandi i prezzi degli items per avere unit_amount e il product per il nome
		url.searchParams.append('expand[]', 'data.items.data.price');
		// non espandiamo product per evitare limiti di profondità; usiamo price.nickname
		// espandi customer per ottenere email
		url.searchParams.append('expand[]', 'data.customer');

	let hasMore = true;
	let startingAfter: string | undefined;
    const counts: Record<string, number> = {};
    const amountByDate: Record<string, { cents: number; currency: string }> = {};
    const purchasesByDate: Record<string, Array<{ email?: string; subscriptionName?: string; amountCents?: number; currency?: string; metadata?: Record<string, string> }>> = {};

	while (hasMore) {
		if (startingAfter) url.searchParams.set('starting_after', startingAfter);
		const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${key}` } });
		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Stripe error ${res.status}: ${text}`);
		}
		const body = (await res.json()) as {
			data: Array<{
				id: string;
				created: number;
				metadata?: Record<string, string>;
				customer?: { email?: string } | string;
				items?: {
					data: Array<{
						price?: {
							unit_amount?: number;
							currency?: string;
							nickname?: string;
							recurring?: { interval?: 'month' | 'year' | 'day' | 'week'; interval_count?: number };
						};
					}>;
				};
			}>;
			has_more: boolean;
		};
		for (const s of body.data) {
			const d = new Date(s.created * 1000);
			const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
			counts[key] = (counts[key] ?? 0) + 1;
			// somma dei unit_amount degli items (se presente), altrimenti 0
			let cents = 0;
            let currency = 'EUR';
            let subscriptionName: string | undefined;
            let email: string | undefined = typeof s.customer === 'object' && s.customer ? (s.customer as any).email : undefined;
            let subCents = 0;
			if (s.items && Array.isArray(s.items.data)) {
				for (const it of s.items.data) {
					const ua = it.price?.unit_amount ?? 0;
					const interval = it.price?.recurring?.interval || 'month';
					const intervalCount = it.price?.recurring?.interval_count || 1;
					// Normalizza a MRR mensile: annuali / 12, mensili come sono
					let monthlyAmount = ua;
					if (interval === 'year') {
						monthlyAmount = ua / 12;
					} else if (interval === 'day') {
						monthlyAmount = ua * 30 * intervalCount;
					} else if (interval === 'week') {
						monthlyAmount = (ua * 52) / 12 * intervalCount;
					}
                    const monthlyCents = Math.round(monthlyAmount);
                    cents += monthlyCents;
                    subCents += monthlyCents;
					if (it.price?.currency) currency = it.price.currency.toUpperCase();
					const nick = it.price?.nickname;
					if (!subscriptionName) subscriptionName = nick;
				}
			}
			if (!amountByDate[key]) amountByDate[key] = { cents: 0, currency };
			amountByDate[key].cents += cents;
			if (!purchasesByDate[key]) purchasesByDate[key] = [];
            purchasesByDate[key].push({ email, subscriptionName, amountCents: subCents, currency, metadata: s.metadata || undefined });
		}
		hasMore = body.has_more;
		startingAfter = body.data.length ? body.data[body.data.length - 1].id : undefined;
	}

	const series: StripeNewSubscriptionPoint[] = Object.keys(counts)
		.sort()
		.map((d) => ({
			date: d,
			count: counts[d],
			totalAmountCents: amountByDate[d]?.cents ?? 0,
			currency: amountByDate[d]?.currency ?? 'EUR',
			purchases: purchasesByDate[d] ?? [],
		}));

	const outDir = join(process.cwd(), 'src', 'data', 'avacy', 'json', 'stripe');
	mkdirSync(outDir, { recursive: true });
	writeFileSync(join(outDir, 'new-subscriptions.json'), JSON.stringify(series, null, 2), 'utf8');
}

export type StripeCancellationPoint = {
    date: string;
    count: number;
    totalAmountCents: number;
    currency: string;
    cancellations: Array<{
        email?: string;
        subscriptionName?: string;
        amountCents?: number;
        canceledAt?: string; // ISO
        cancelAt?: string; // ISO (scheduled)
        currency?: string;
        metadata?: Record<string, string>;
    }>;
};

export async function fetchCancellations(): Promise<void> {
    const key = getEnv('STRIPE_API_KEY');
    const fromIso = '2020-01-01';
    const fromDate = new Date(`${fromIso}T00:00:00Z`);

    const counts: Record<string, number> = {};
    const amountByDate: Record<string, { cents: number; currency: string }> = {};
    const cancellationsByDate: Record<string, Array<{ email?: string; subscriptionName?: string; amountCents?: number; canceledAt?: string; cancelAt?: string; currency?: string; metadata?: Record<string, string> }>> = {};

    async function fetchAndAccumulate(listUrl: URL, kind: 'canceled' | 'active') {
        let hasMore = true;
        let startingAfter: string | undefined;
        while (hasMore) {
            if (startingAfter) listUrl.searchParams.set('starting_after', startingAfter);
            const res = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${key}` } });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Stripe error ${res.status}: ${text}`);
            }
            const body = (await res.json()) as {
                data: Array<{
                    id: string;
                    created: number;
                    status?: string;
                    canceled_at?: number | null;
                    cancel_at?: number | null;
                    metadata?: Record<string, string>;
                    customer?: { email?: string } | string;
				items?: {
					data: Array<{
						price?: {
							unit_amount?: number;
							currency?: string;
							nickname?: string;
							recurring?: { interval?: 'month' | 'year' | 'day' | 'week'; interval_count?: number };
						};
					}>;
				};
                }>;
                has_more: boolean;
            };

            for (const s of body.data) {
                const canceledAtUnix = s.canceled_at ?? null;
                const cancelAtUnix = s.cancel_at ?? null;
                const referenceUnix = kind === 'canceled' ? canceledAtUnix : cancelAtUnix;
                if (!referenceUnix) continue;
                if ((referenceUnix as number) * 1000 < fromDate.getTime()) continue;

                const dt = new Date((referenceUnix as number) * 1000);
                const keyDay = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
                counts[keyDay] = (counts[keyDay] ?? 0) + 1;

                let cents = 0;
                let currency = 'EUR';
            let subscriptionName: string | undefined;
                let email: string | undefined = typeof s.customer === 'object' && s.customer ? (s.customer as any).email : undefined;
            let subCents = 0;
			if (s.items && Array.isArray(s.items.data)) {
				for (const it of s.items.data) {
					const ua = it.price?.unit_amount ?? 0;
					const interval = it.price?.recurring?.interval || 'month';
					const intervalCount = it.price?.recurring?.interval_count || 1;
					// Normalizza a MRR mensile: annuali / 12, mensili come sono
					let monthlyAmount = ua;
					if (interval === 'year') {
						monthlyAmount = ua / 12;
					} else if (interval === 'day') {
						monthlyAmount = ua * 30 * intervalCount;
					} else if (interval === 'week') {
						monthlyAmount = (ua * 52) / 12 * intervalCount;
					}
					const monthlyCents = Math.round(monthlyAmount);
					cents += monthlyCents;
					subCents += monthlyCents;
					if (it.price?.currency) currency = it.price.currency.toUpperCase();
					const nick = it.price?.nickname;
					if (!subscriptionName) subscriptionName = nick;
				}
			}
                if (!amountByDate[keyDay]) amountByDate[keyDay] = { cents: 0, currency };
                amountByDate[keyDay].cents += cents;
                if (!cancellationsByDate[keyDay]) cancellationsByDate[keyDay] = [];
                cancellationsByDate[keyDay].push({
                    email,
                    subscriptionName,
                    amountCents: subCents,
                    canceledAt: canceledAtUnix ? new Date(canceledAtUnix * 1000).toISOString() : undefined,
                    cancelAt: cancelAtUnix ? new Date(cancelAtUnix * 1000).toISOString() : undefined,
                    currency,
                    metadata: s.metadata || undefined,
                });
            }

            hasMore = body.has_more;
            startingAfter = body.data.length ? body.data[body.data.length - 1].id : undefined;
        }
    }

    const baseExpansions = ['data.items.data.price', 'data.customer'];
    const urlCanceled = new URL('https://api.stripe.com/v1/subscriptions');
    urlCanceled.searchParams.set('limit', '100');
    urlCanceled.searchParams.set('status', 'canceled');
    baseExpansions.forEach((e) => urlCanceled.searchParams.append('expand[]', e));
    await fetchAndAccumulate(urlCanceled, 'canceled');

    const urlActive = new URL('https://api.stripe.com/v1/subscriptions');
    urlActive.searchParams.set('limit', '100');
    urlActive.searchParams.set('status', 'active');
    baseExpansions.forEach((e) => urlActive.searchParams.append('expand[]', e));
    await fetchAndAccumulate(urlActive, 'active');

    const series: StripeCancellationPoint[] = Object.keys(counts)
        .sort()
        .map((d) => ({
            date: d,
            count: counts[d],
            totalAmountCents: amountByDate[d]?.cents ?? 0,
            currency: amountByDate[d]?.currency ?? 'EUR',
            cancellations: cancellationsByDate[d] ?? [],
        }));

    const outDir = join(process.cwd(), 'src', 'data', 'avacy', 'json', 'stripe');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'cancellations.json'), JSON.stringify(series, null, 2), 'utf8');
}


