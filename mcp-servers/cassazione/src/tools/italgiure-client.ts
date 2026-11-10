import { createHttpClient, fetchWithRetry, parseApiError, buildSearchEngineUrls, buildEcliUrlCassazione, extractEstremi } from '@bettercallclaude-italia/shared';
import type { SearchMassimeInput } from '../types.js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { getSessionCookie } from './session-store.js';

const ITALGIURE_BASE = 'https://www.italgiure.giustizia.it/sncass';
export const SOLR_ENDPOINT = `${ITALGIURE_BASE}/isapi/hc.dll/sn.solr/sn-collection/select?app.query`;

/**
 * Diagnosi del fallimento di trasporto.
 *
 * Misurato dal container di produzione: www.italgiure.giustizia.it scarta a
 * livello TCP le connessioni provenienti dall'IP del datacenter che ospita
 * questo server, con o senza cookie di sessione. Il messaggio è però limitato
 * a ciò che è stato osservato: la connessione non ha raggiunto il servizio
 * (timeout o connessione non riuscita). Il blocco per IP è il caso noto e
 * misurato del deployment su datacenter, non una diagnosi valida per qualsiasi
 * host (su una postazione locale il fallimento può essere anche un servizio
 * momentaneamente indisponibile).
 *
 * Il canale supportato per la ricerca Cassazione è lato client (skill
 * italgiure-search del plugin BetterCallClaude), che interroga lo stesso
 * indice dall'IP dell'utente.
 */
export const ITALGIURE_BLOCKED_MESSAGE =
  'La connessione a ItalGiure non ha raggiunto il servizio (timeout o connessione non ' +
  'riuscita a livello di rete, osservato ora). Le cause possibili sono il blocco per IP ' +
  '(il caso noto e misurato del deployment su IP datacenter, dove lo scarto avviene prima ' +
  'che la richiesta raggiunga il servizio e il cookie non cambia l\'esito) oppure ' +
  'l\'indisponibilità del servizio. ' +
  'Il canale supportato per la ricerca Cassazione è lato client (skill italgiure-search ' +
  'del plugin BetterCallClaude Italia), che interroga lo stesso indice pubblico ' +
  'SentenzeWeb dall\'IP del computer dell\'utente.';

/**
 * Procedura corretta per ottenere il cookie di sessione.
 *
 * I cookie di sessione dell'area riservata sono HttpOnly: la Console del
 * browser restituisce una stringa vuota e l'API JavaScript dei cookie non può
 * leggerli. L'unica fonte è l'intestazione Cookie di una richiesta dati
 * dell'area riservata, vista nella scheda Network degli strumenti per
 * sviluppatori.
 */
export const ITALGIURE_COOKIE_PROCEDURE =
  'Per ottenere il cookie di sessione: accedi all\'area riservata ' +
  'https://www.italgiure.giustizia.it/new/archives con SPID o credenziali ' +
  'professionali, apri gli strumenti per sviluppatori (F12 / Cmd+Option+I), ' +
  'vai nella scheda Network PRIMA di fare la ricerca, individua la richiesta ' +
  'dati dell\'area riservata e copia il valore completo dell\'intestazione ' +
  'Cookie in Request Headers. I cookie sono HttpOnly: la Console restituisce ' +
  'una stringa vuota e l\'API JavaScript dei cookie non li espone. ' +
  'Passa il valore al server tramite la variabile ITALGIURE_COOKIE o il ' +
  'parametro cookie dell\'API MCP.';

/**
 * Messaggio del ramo "nessun cookie configurato".
 *
 * In questo ramo non viene inviata alcuna richiesta: qui non si può dire che
 * c'è stato un timeout o un blocco per IP, solo che la ricerca non è eseguibile
 * e come rimediare.
 */
export const ITALGIURE_MISSING_COOKIE_MESSAGE =
  'Senza un cookie di sessione ItalGiure la ricerca non è eseguibile: nessuna richiesta ' +
  'è stata inviata al servizio. Se il cookie è valido e la ricerca continua a restituire ' +
  'zero risultati, il canale supportato per la Cassazione è lato client (skill ' +
  'italgiure-search del plugin BetterCallClaude Italia), che interroga lo stesso indice ' +
  'pubblico SentenzeWeb dall\'IP del computer dell\'utente.';

/**
 * Classificazione di un fallimento del client ItalGiure.
 *
 * - 'trasporto': la connessione non ha raggiunto il servizio (timeout o
 *   indisponibilità senza una risposta HTTP). Nel deployment su IP datacenter
 *   è il blocco noto; da un IP ammesso può essere anche un servizio
 *   momentaneamente giù.
 * - 'cookie': il servizio ha risposto 401/403, cioè la sessione manca o è scaduta.
 * - 'errore': il servizio ha risposto con un errore HTTP, oppure è fallito in
 *   altro modo (rate limit, errore interno): qui non si sa nulla sullo stato
 *   della rete, quindi il messaggio non deve dichiarare un blocco per IP.
 */
export type TipoFallimentoItalgiure = 'trasporto' | 'cookie' | 'errore';

export interface FallimentoItalgiure {
  tipo: TipoFallimentoItalgiure;
  messaggio: string;
}

/**
 * Estrae lo status HTTP dal errore grezzo.
 *
 * parseApiError collassa in API_UNAVAILABLE sia una risposta HTTP >= 500 sia
 * una connessione mai arrivata al servizio: per distinguerle serve lo status
 * della risposta. La forma dell'errore axios viene letta per duck-typing, senza
 * importare axios in questo pacchetto.
 */
export function statusHttpErrore(error: unknown): number | undefined {
  const status = (error as { response?: { status?: number } } | undefined)?.response?.status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * Classifica un errore del client ItalGiure in base al codice restituito da
 * parseApiError, al messaggio originale e allo status HTTP della risposta.
 *
 * Lo status distingue "il servizio ha risposto con un errore" da "la
 * connessione non ha raggiunto il servizio": senza risposta HTTP non si può
 * attribuire al blocco per IP un timeout che forse non c'è stato.
 *
 * Il ramo che deduce il problema di cookie dal solo messaggio
 * (`cookieDaMessaggio`) è oggi irraggiungibile dai chiamanti del modulo, che
 * passano sempre lo status HTTP reale: resta per compatibilità, se
 * `parseApiError` cambiasse forma.
 */
export function classificaFallimentoItalgiure(
  code: string,
  message: string,
  status?: number
): FallimentoItalgiure {
  const cookieDaStatus = status === 401 || status === 403;
  const cookieDaMessaggio =
    status === undefined &&
    code === 'API_ERROR' &&
    (message.includes('401') || message.includes('403'));

  // Il messaggio originale può già terminare con un punto: si toglie il punto
  // finale per non accumulare punteggiatura quando il ramo aggiunge il proprio.
  const testo = message.replace(/\.+\s*$/, '');

  if (cookieDaStatus || cookieDaMessaggio) {
    return {
      tipo: 'cookie',
      messaggio: `Sessione ItalGiure scaduta o non valida (${testo}).`,
    };
  }

  if (status !== undefined) {
    return {
      tipo: 'errore',
      messaggio: `Errore ItalGiure: il servizio ha risposto con HTTP ${status} (${testo}).`,
    };
  }

  if (code === 'API_TIMEOUT' || code === 'API_UNAVAILABLE') {
    return { tipo: 'trasporto', messaggio: ITALGIURE_BLOCKED_MESSAGE };
  }

  return { tipo: 'errore', messaggio: `Errore ItalGiure: ${testo}.` };
}

/**
 * Legge il cookie di sessione ItalGiure da parametro, vault sessioni,
 * env var o file locale.
 * Priorità: parametro > session vault (session_key) > env var > file locale.
 */
export function getItalgiureCookie(paramCookie?: string, sessionKey?: string): string | undefined {
  if (paramCookie && paramCookie.trim()) {
    return paramCookie.trim();
  }

  if (sessionKey && sessionKey.trim()) {
    const fromVault = getSessionCookie(sessionKey.trim());
    if (fromVault) return fromVault;
  }

  const envCookie = process.env.ITALGIURE_COOKIE;
  if (envCookie) return envCookie.trim();

  const filePath = resolve(process.cwd(), 'italgiure_cookie.txt');
  if (existsSync(filePath)) {
    try {
      return readFileSync(filePath, 'utf-8').trim();
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/**
 * Restituisce true se il cookie è configurato.
 */
export function isItalgiureConfigured(paramCookie?: string): boolean {
  return !!getItalgiureCookie(paramCookie);
}

/**
 * Crea un client HTTP per ItalGiure con SSL bypass per la CA non standard.
 */
export function createItalgiureClient() {
  return createHttpClient({
    baseURL: ITALGIURE_BASE,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${ITALGIURE_BASE}/`,
    },
    rejectUnauthorized: false,
  });
}

/**
 * Costruisce la query Solr dai parametri utente.
 */
export function buildSolrQuery(input: SearchMassimeInput): string {
  const clauses: string[] = [];

  if (input.query) {
    // Se la query contiene già sintassi Solr avanzata, la usiamo così com'è;
    // altrimenti la trattiamo come testo libero con prossimità implicita
    const q = input.query.trim();
    if (q.startsWith('(') || q.includes(':') || q.includes('~') || q.includes('AND') || q.includes('OR')) {
      clauses.push(q);
    } else {
      // Escape dei caratteri speciali Solr semplici
      const escaped = q.replace(/([+\-!(){}[\]^"~*?:\\/])/g, '\\$1');
      clauses.push(`(${escaped})`);
    }
  }

  if (input.materia) {
    const kind = input.materia === 'civile' ? 'snciv' : 'snpen';
    clauses.push(`kind:"${kind}"`);
  }

  if (input.anno && input.anno > 0) {
    clauses.push(`anno:"${input.anno}"`);
  }

  if (input.tipo) {
    // Capitalizza la prima lettera per matchare il campo tipoprov
    const tipo = input.tipo.charAt(0).toUpperCase() + input.tipo.slice(1).toLowerCase();
    clauses.push(`tipoprov:"${tipo}"`);
  }

  return clauses.join(' AND ');
}

/**
 * Calcola l'offset di paginazione per Solr.
 */
export function calculateStart(page?: number, pageSize?: number): number {
  const p = page ?? 1;
  const ps = pageSize ?? 20;
  return (p - 1) * ps;
}

/**
 * Costruisce l'URL del PDF da un campo filename della risposta Solr.
 */
export function buildPdfUrl(filename: string): string {
  const clean = filename.replace(/^\.\//, '');
  return `${ITALGIURE_BASE}/${clean}`;
}

export interface SolrDocument {
  id: string;
  numdec?: string;
  anno?: string;
  szdec?: string;
  kind?: string;
  tipoprov?: string;
  datdec?: string;
  datdep?: string[];
  filename?: string[];
}

export interface SolrResponse {
  responseHeader: { status: number; QTime: number };
  response: {
    numFound: number;
    start: number;
    docs: SolrDocument[];
  };
}

/**
 * Esegue la ricerca su ItalGiure Solr.
 */
export async function searchItalgiure(input: SearchMassimeInput): Promise<{
  success: true;
  cookieValido: true;
  totale: number;
  start: number;
  massime: Array<{
    id: string;
    estremi: string;
    sezione: string;
    tipo: string;
    dataDecisione: string;
    dataDeposito?: string;
    urlPdf?: string;
  }>;
} | {
  success: false;
  cookieValido: false;
  totale: number;
  massime: never[];
  fallback: {
    urlRicerca: string;
    urlItalgiure: string;
    urlSentenzeWeb: string;
    urlEcli?: string;
    urlGoogle: string;
    urlDuckDuckGo: string;
    istruzioni: string;
  };
}> {
  const cookie = getItalgiureCookie(input.cookie, input.session_key);
  const q = buildSolrQuery(input);
  const rows = input.pageSize ?? 20;
  const start = calculateStart(input.page, input.pageSize);

  // Fallback URL sempre pre-calcolati
  const params = new URLSearchParams();
  params.set('q', input.query);
  const urlRicerca = `${ITALGIURE_BASE}/isapi/hc.dll/sn.solr/sn-collection/select?app.query&${params.toString()}`;
  const urlItalgiure = `${ITALGIURE_BASE}/sncass.php?${new URLSearchParams({ q: input.query, tipo: 'massime' }).toString()}`;
  const urlSentenzeWeb = `https://www.italgiure.giustizia.it/sncass/`;
  const estremi = extractEstremi(input.query);
  const urlEcli = estremi ? buildEcliUrlCassazione(estremi.anno, estremi.numero) : undefined;
  const { google, duckduckgo } = buildSearchEngineUrls('cortedicassazione.it', [input.query, 'sentenza']);

  if (!cookie) {
    return {
      success: false,
      cookieValido: false,
      totale: 0,
      massime: [],
      fallback: {
        urlRicerca,
        urlItalgiure,
        urlSentenzeWeb,
        urlEcli,
        urlGoogle: google,
        urlDuckDuckGo: duckduckgo,
        istruzioni: ITALGIURE_MISSING_COOKIE_MESSAGE + ' ' + ITALGIURE_COOKIE_PROCEDURE,
      },
    };
  }

  const client = createItalgiureClient();

  try {
    const result = await fetchWithRetry(
      'cassazione',
      async () => {
        const res = await client.post(SOLR_ENDPOINT, new URLSearchParams({
          q,
          rows: String(rows),
          start: String(start),
          wt: 'json',
          fl: 'id,filename,szdec,tipoprov,datdec,numdec,anno,kind,datdep',
          sort: 'pd desc,datdec desc',
        }), {
          headers: {
            Cookie: cookie,
          },
        });
        return res.data as SolrResponse;
      },
      { retries: 1 }
    );

    const docs = result.response.docs;
    const massime = docs.map((doc) => ({
      id: doc.id,
      estremi: doc.numdec && doc.anno && doc.szdec
        ? `Sez. ${doc.szdec} ${doc.tipoprov ?? 'Provvedimento'} n. ${doc.numdec} del ${doc.anno}`
        : doc.id,
      sezione: doc.szdec ?? '',
      tipo: doc.tipoprov ?? '',
      dataDecisione: doc.datdec ?? '',
      dataDeposito: doc.datdep?.[0],
      urlPdf: doc.filename?.[0] ? buildPdfUrl(doc.filename[0]) : undefined,
    }));

    return {
      success: true,
      cookieValido: true,
      totale: result.response.numFound,
      start: result.response.start,
      massime,
    };
  } catch (error) {
    const parsed = parseApiError(error);
    const fallimento = classificaFallimentoItalgiure(
      parsed.code,
      parsed.message,
      statusHttpErrore(error)
    );

    const istruzioni =
      fallimento.tipo === 'cookie'
        ? fallimento.messaggio + ' ' + ITALGIURE_COOKIE_PROCEDURE
        : fallimento.messaggio;

    return {
      success: false,
      cookieValido: false,
      totale: 0,
      massime: [],
      fallback: {
        urlRicerca,
        urlItalgiure,
        urlSentenzeWeb,
        urlEcli,
        urlGoogle: google,
        urlDuckDuckGo: duckduckgo,
        istruzioni,
      },
    };
  }
}

/**
 * Recupera una singola sentenza da ItalGiure per ID.
 */
export async function getSentenzaItalgiure(id: string, paramCookie?: string, sessionKey?: string): Promise<{
  success: true;
  cookieValido: true;
  sentenza: {
    id: string;
    estremi: string;
    sezione: string;
    tipo: string;
    dataDecisione: string;
    dataDeposito?: string;
    urlPdf?: string;
  };
} | {
  success: false;
  cookieValido: true;
  messaggio: string;
} | {
  success: false;
  cookieValido: false;
  fallback: {
    urlItalgiure: string;
    urlSentenzeWeb: string;
    istruzioni: string;
  };
}> {
  const cookie = getItalgiureCookie(paramCookie, sessionKey);

  if (!cookie) {
    return {
      success: false,
      cookieValido: false,
      fallback: {
        urlItalgiure: `${ITALGIURE_BASE}/sncass.php`,
        urlSentenzeWeb: 'https://www.italgiure.giustizia.it/sncass/',
        istruzioni: ITALGIURE_MISSING_COOKIE_MESSAGE + ' ' + ITALGIURE_COOKIE_PROCEDURE,
      },
    };
  }

  const client = createItalgiureClient();

  try {
    const result = await fetchWithRetry(
      'italgiure',
      async () => {
        const res = await client.post(SOLR_ENDPOINT, new URLSearchParams({
          q: `id:"${id.replace(/(["\\])/g, '\\$1')}"`,
          rows: '1',
          wt: 'json',
          fl: 'id,filename,szdec,tipoprov,datdec,numdec,anno,kind,datdep',
        }), {
          headers: {
            Cookie: cookie,
          },
        });
        return res.data as SolrResponse;
      },
      { retries: 1 }
    );

    const doc = result.response.docs[0];
    if (!doc) {
      return {
        success: false,
        cookieValido: true,
        messaggio: `Sentenza ${id} non trovata in ItalGiure. Prova SentenzeWeb (https://www.italgiure.giustizia.it/sncass/) o verifica l'identificativo.`,
      };
    }

    return {
      success: true,
      cookieValido: true,
      sentenza: {
        id: doc.id,
        estremi: doc.numdec && doc.anno && doc.szdec
          ? `Sez. ${doc.szdec} ${doc.tipoprov ?? 'Provvedimento'} n. ${doc.numdec} del ${doc.anno}`
          : doc.id,
        sezione: doc.szdec ?? '',
        tipo: doc.tipoprov ?? '',
        dataDecisione: doc.datdec ?? '',
        dataDeposito: doc.datdep?.[0],
        urlPdf: doc.filename?.[0] ? buildPdfUrl(doc.filename[0]) : undefined,
      },
    };
  } catch (error) {
    const parsed = parseApiError(error);
    const fallimento = classificaFallimentoItalgiure(
      parsed.code,
      parsed.message,
      statusHttpErrore(error)
    );

    const istruzioni =
      fallimento.tipo === 'cookie'
        ? fallimento.messaggio + ' ' + ITALGIURE_COOKIE_PROCEDURE
        : fallimento.messaggio;

    return {
      success: false,
      cookieValido: false,
      fallback: {
        urlItalgiure: `${ITALGIURE_BASE}/sncass.php`,
        urlSentenzeWeb: 'https://www.italgiure.giustizia.it/sncass/',
        istruzioni,
      },
    };
  }
}
