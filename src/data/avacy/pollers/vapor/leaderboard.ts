
import { createVaporPool } from '../../db/client';
import { saveJsonFile } from '../../pollers/s3-utils';

export async function fetchLeaderboard(): Promise<void> {
	const pool = createVaporPool();

	console.log('=== Vapor RDS: fetch domain leaderboard ===');

	try {
		const [rows] = await pool.query(`
			SELECT 
                domain_url as domain,
                request_count as visits,
                request_percentage,
                month,
                year,
                tenant_id
			FROM vapor.domain_leaderboard 
			ORDER BY year DESC, month DESC, request_count DESC
		`) as any[];

		console.log(`Fetched ${rows.length} leaderboard entries`);

		if (rows.length > 0) {
			console.log('Sample row:', rows[0]);
		}

		await saveJsonFile('vapor/leaderboard.json', rows);
		console.log(`✓ Saved leaderboard data`);
	} finally {
		await pool.end();
	}
}

export default fetchLeaderboard;
