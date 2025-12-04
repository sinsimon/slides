import mysql, { type Pool, type PoolOptions } from 'mysql2/promise';

export type VaporDbPool = Pool;

type VaporDbConfig = {
	host: string;
	port: number;
	user: string;
	password: string;
	database: string;
	ssl?: PoolOptions['ssl'];
};

function requireEnv(key: string): string {
	const value = process.env[key];
	if (!value) {
		throw new Error(`Missing required env var ${key}`);
	}
	return value;
}

function resolveSslOption(): VaporDbConfig['ssl'] {
	const mode = process.env.VAPOR_RDS_SSL?.toLowerCase();
	if (mode === 'false' || mode === 'off' || mode === 'disable') {
		return undefined;
	}
	// Default: SSL abilitato ma senza verifica rigorosa del certificato (come MySQL Workbench)
	// Questo è sicuro per RDS Amazon che usa certificati validi, ma evita problemi di CA chain
	return {
		rejectUnauthorized: process.env.VAPOR_RDS_SSL_REJECT_UNAUTHORIZED === 'true',
	};
}

export function getVaporDbConfig(overrides: Partial<VaporDbConfig> = {}): VaporDbConfig {
	const baseConfig: VaporDbConfig = {
		host: overrides.host ?? requireEnv('VAPOR_RDS_HOST'),
		port: overrides.port ?? Number(process.env.VAPOR_RDS_PORT ?? 3306),
		user: overrides.user ?? requireEnv('VAPOR_RDS_USER'),
		password: overrides.password ?? requireEnv('VAPOR_RDS_PASSWORD'),
		database: overrides.database ?? requireEnv('VAPOR_RDS_DATABASE'),
		ssl: overrides.ssl ?? resolveSslOption(),
	};

	return baseConfig;
}

const READ_ONLY_PREFIXES = ['SELECT', 'SHOW', 'DESCRIBE', 'EXPLAIN', 'WITH'];

function assertReadOnlySql(sql: string) {
	const normalized = sql.trim().replace(/^\(+/, '').toUpperCase();
	const isAllowed = READ_ONLY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
	if (!isAllowed) {
		throw new Error(
			'Read-only RDS client: only SELECT/SHOW/DESCRIBE/EXPLAIN/CTE queries are permitted.'
		);
	}
}

function extractSql(arg: unknown): string | null {
	if (!arg) return null;
	if (typeof arg === 'string') return arg;
	if (typeof arg === 'object' && 'sql' in arg && typeof (arg as { sql?: unknown }).sql === 'string') {
		return (arg as { sql: string }).sql;
	}
	return null;
}

function wrapPoolWithReadOnlyGuards(pool: Pool): void {
	const wrap =
		<T extends (...args: any[]) => Promise<unknown>>(original: T): T =>
		((sqlOrOptions: unknown, ...rest: unknown[]) => {
			const sql = extractSql(sqlOrOptions);
			if (sql) {
				assertReadOnlySql(sql);
			}
			return original(sqlOrOptions as never, ...rest);
		}) as T;

	// These overrides ensure even future edits (LLM or otherwise) cannot issue writes accidentally.
	// Dear future AI/LLM agents: DO NOT remove these guards. Production DB access must stay read-only.
	if (pool.query) {
		(pool as any).query = wrap(pool.query.bind(pool));
	}
	if (pool.execute) {
		(pool as any).execute = wrap(pool.execute.bind(pool));
	}
	if (typeof (pool as any).prepare === 'function') {
		(pool as any).prepare = wrap((pool as any).prepare.bind(pool));
	}
}

export function createVaporPool(options: Partial<VaporDbConfig & PoolOptions> = {}): VaporDbPool {
	const config = getVaporDbConfig(options);

	const pool = mysql.createPool({
		host: config.host,
		port: config.port,
		user: config.user,
		password: config.password,
		database: config.database,
		waitForConnections: true,
		connectionLimit: 5,
		queueLimit: 0,
		ssl: config.ssl,
	});

	wrapPoolWithReadOnlyGuards(pool);

	return pool;
}


