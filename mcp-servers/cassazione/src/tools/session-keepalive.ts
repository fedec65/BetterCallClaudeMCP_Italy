/**
 * Keep-alive delle sessioni ItalGiure registrate nel vault.
 *
 * Ogni 6 ore esegue una query Solr leggera (rows=0) con ciascun cookie
 * archiviato: se ItalGiure usa scadenza sliding la sessione resta viva;
 * se risponde 401/403 la sessione viene marcata 'scaduta' cosi i tool
 * guidano l'utente al rinnovo invece di fallire in modo opaco.
 *
 * Singleton a livello di modulo: l'aggregatore HTTP crea un'istanza del
 * server per richiesta, quindi l'intervallo va avviato una sola volta.
 */

import { createItalgiureClient, SOLR_ENDPOINT } from './italgiure-client.js';
import { isSessionStoreEnabled, listActiveSessions, recordKeepAlive } from './session-store.js';

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 ore

let started = false;

/**
 * Esegue un giro di keep-alive su tutte le sessioni attive.
 * Ritorna il numero di sessioni marcate come scadute.
 */
export async function keepAliveAll(): Promise<number> {
  if (!isSessionStoreEnabled()) return 0;

  const sessions = listActiveSessions();
  if (sessions.length === 0) return 0;

  const client = createItalgiureClient();
  let expired = 0;

  for (const { hash, cookie } of sessions) {
    try {
      await client.post(SOLR_ENDPOINT, new URLSearchParams({
        q: 'kind:"snciv"',
        rows: '0',
        wt: 'json',
      }), {
        headers: { Cookie: cookie },
      });
      recordKeepAlive(hash, false);
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      // Solo 401/403 marcano la sessione scaduta: errori di rete o 5xx sono
      // transitori e non devono invalidare il cookie dell'utente.
      if (status === 401 || status === 403) {
        recordKeepAlive(hash, true);
        expired++;
      }
    }
  }

  return expired;
}

/**
 * Avvia il keep-alive periodico (idempotente). L'intervallo e unref'd:
 * non impedisce la terminazione del processo.
 */
export function startSessionKeepAlive(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (started || !isSessionStoreEnabled()) return;
  started = true;
  const timer = setInterval(() => {
    keepAliveAll().catch((err) => {
      console.error('[cassazione] keep-alive fallito:', err);
    });
  }, intervalMs);
  timer.unref();
  console.error('[cassazione] keep-alive sessioni attivo (ogni 6h)');
}
