import { useEffect, useState } from 'react';
import { buildDataUrl, fetchWithCacheBust } from '../utils/assets';

export type TenantFunnelData = {
	tenantId: string | null; // null per utenti senza tenant (usano email come ID)
	tenantName?: string | null;
	tenantCreatedAt?: string | null;
	tenantMemberCount?: number | null;
	plan?: string | null;
	domains?: string | null;
	hasWebspace: boolean;
	webspaceCount: number;
	isNonFree: boolean;
	// Per tenant: array di email. Per utenti senza tenant: array con una sola email
	emails: string[];
	// Data di registrazione più vecchia tra gli utenti del tenant
	registeredAt: string;
	// Se almeno un utente ha verificato l'email
	emailVerified: boolean;
};

export type UsersFunnelPayload = {
	fetchedAt: string;
	stats: {
		total: number;
		emailVerified: number;
		hasTenant: number;
		hasWebspace: number;
		isNonFree: number;
		conversionRates: {
			emailVerification: string;
			tenantCreation: string;
			webspaceCreation: string;
			nonFreeConversion: string;
		};
	};
	tenants: TenantFunnelData[];
};

const DATA_URL = buildDataUrl('data/avacy/json/vapor/users-funnel.json');

export function useUsersFunnel() {
	const [data, setData] = useState<UsersFunnelPayload | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);

		fetchWithCacheBust(DATA_URL)
			.then(async (res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return (await res.json()) as UsersFunnelPayload;
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

