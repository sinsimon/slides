/**
 * Poller per i dati RAI - Genera JSON statici
 * 
 * RAI è un cliente unico che paga 14.5K€ all'anno (2023-2027)
 * MRR = 14.500 / 12 = 1.208,33€ = 120.833 centesimi
 */
export async function fetchRaiSubscriptions(): Promise<{
	data: Array<{
		date: string;
		count: number;
		totalAmountCents: number;
		currency: string;
		purchases: Array<{
			email?: string;
			subscriptionName?: string;
			amountCents?: number;
			currency?: string;
			webspacesCount?: number;
			metadata?: Record<string, string>;
		}>;
	}>;
	lastUpdated: string;
}> {
	const mrrCents = 120833; // 14.500€ / 12 mesi = 1.208,33€ al mese
	
	return {
		data: [
			{
				date: "2023-01-01",
				count: 1,
				totalAmountCents: mrrCents,
				currency: "EUR",
				purchases: [
					{
						email: "amministrazione@rai.it",
						subscriptionName: "Enterprise",
						amountCents: mrrCents,
						currency: "EUR",
						webspacesCount: 1,
						metadata: {
							source: "rai"
						}
					}
				]
			}
		],
		lastUpdated: new Date().toISOString()
	};
}

export async function fetchRaiCancellations(): Promise<{
	data: Array<{
		date: string;
		count: number;
		totalAmountCents: number;
		currency: string;
		cancellations: Array<{
			email?: string;
			subscriptionName?: string;
			amountCents?: number;
			currency?: string;
			canceledAt?: string;
			metadata?: Record<string, string>;
		}>;
	}>;
	lastUpdated: string;
}> {
	const mrrCents = 120833; // 14.500€ / 12 mesi = 1.208,33€ al mese
	
	return {
		data: [
			{
				date: "2028-01-01",
				count: 1,
				totalAmountCents: mrrCents,
				currency: "EUR",
				cancellations: [
					{
						email: "amministrazione@rai.it",
						subscriptionName: "Enterprise",
						amountCents: mrrCents,
						currency: "EUR",
						canceledAt: "2028-01-01T00:00:00.000Z",
						metadata: {
							source: "rai"
						}
					}
				]
			}
		],
		lastUpdated: new Date().toISOString()
	};
}

