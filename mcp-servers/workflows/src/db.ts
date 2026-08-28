import { Pool } from 'pg';
import { SCHEMA_SQL } from './sql.js';
import { AGENTS_MANIFEST } from './manifest.js';

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function getPool(connectionString?: string): Pool {
  if (!pool) {
    const cs = connectionString ?? process.env.DATABASE_URL;
    if (!cs) {
      throw new Error(
        'Variabile d\'ambiente DATABASE_URL non impostata — workflows-ita richiede una connection string Postgres'
      );
    }
    // Postgres locale (container dev/test) non ha SSL; il Postgres gestito (Railway) lo richiede.
    // Uno sslmode esplicito nella connection string vince: un'opzione `ssl` qui lo
    // sovrascriverebbe e romperebbe es. il Postgres della private network Railway (`sslmode=disable`).
    const isLocal = /^(postgres(ql)?:\/\/)?[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(cs);
    const hasSslmode = /[?&]sslmode=/.test(cs);
    pool = new Pool({
      connectionString: cs,
      max: 5,
      ssl: isLocal || hasSslmode ? undefined : { rejectUnauthorized: false }
    });
  }
  return pool;
}

/**
 * Schema + seed del manifest idempotente. Memoizzato: esegue una sola volta per
 * processo (cold start), coerente col modello stateless per-request di
 * mcp-servers-http. Sicuro da chiamare in concorrenza.
 */
export function ensureSchema(p: Pool = getPool()): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await p.query(SCHEMA_SQL);
      for (const a of AGENTS_MANIFEST) {
        await p.query(
          `INSERT INTO agents_manifest
             (agent_id, display_name, input_types, output_types, mcp_servers, is_terminal)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (agent_id) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             input_types  = EXCLUDED.input_types,
             output_types = EXCLUDED.output_types,
             mcp_servers  = EXCLUDED.mcp_servers,
             is_terminal  = EXCLUDED.is_terminal`,
          [a.agent_id, a.display_name, a.input_types, a.output_types, a.mcp_servers, a.is_terminal]
        );
      }
    })();
    schemaReady.catch(() => {
      schemaReady = null; // permette il retry alla richiesta successiva se il DB era momentaneamente irraggiungibile
    });
  }
  return schemaReady;
}

/** Teardown dei test / hot reload: chiude il pool e resetta i singleton. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    schemaReady = null;
  }
}
