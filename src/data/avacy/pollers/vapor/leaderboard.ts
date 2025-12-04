import { createVaporPool } from '../../db/client';
import type { VaporPollVars } from './tenants';

export async function fetchLeaderboard(vars: VaporPollVars): Promise<Array<{
	domain: string;
	visits: number;
	request_percentage: number;
	month: number;
	year: number;
	tenant_id: string | null;
}>> {
	const pool = createVaporPool({
		host: vars.VAPOR_RDS_HOST,
		port: parseInt(vars.VAPOR_RDS_PORT, 10),
		user: vars.VAPOR_RDS_USER,
		password: vars.VAPOR_RDS_PASSWORD,
		database: vars.VAPOR_RDS_DATABASE,
	});

	console.log('=== Vapor RDS: fetch domain leaderboard ===');

	try {
		const [rows] = await pool.query(`
			SELECT 
                dl.domain_url as domain,
                dl.request_count as visits,
                dl.request_percentage,
                dl.month,
                dl.year,
                -- Usa solo il tenant_id dalla tabella domains (più affidabile)
                -- Se non c'è match, usa NULL e lascia che il componente SlideLeaderboard
                -- faccia il matching per dominio nei webspaces
                d.tenant_id as tenant_id
			FROM vapor.domain_leaderboard dl
			LEFT JOIN domains d ON (
				-- Normalizza i domini per il matching: rimuovi protocollo, www, trailing slash e path
				-- Estrai il dominio base (senza subdomain) per il matching
				SUBSTRING_INDEX(
					LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(dl.domain_url, 'https://', ''), 'http://', ''), 'www.', ''), '/', ''))),
					'/',
					1
				) = SUBSTRING_INDEX(
					LOWER(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(d.domain, 'https://', ''), 'http://', ''), 'www.', ''), '/', ''))),
					'/',
					1
				)
			)
			ORDER BY dl.year DESC, dl.month DESC, dl.request_count DESC
		`) as any[];

		return rows;
	} finally {
		await pool.end();
	}
}

export default fetchLeaderboard;
