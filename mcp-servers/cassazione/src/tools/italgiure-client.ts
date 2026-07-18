import { createHttpClient, fetchWithRetry, parseApiError, buildSearchEngineUrls, buildEcliUrlCassazione, extractEstremi } from '@bettercallclaude-italia/shared';
import type { SearchMassimeInput } from '../types.js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ITALGIURE_BASE = 'https://www.italgiure.giustizia.it/sncass';
const SOLR_ENDPOINT = `${ITALGIURE_BASE}/isapi/hc.dll/sn.solr/sn-collection/select?app.query`;

/**
 * Legge il cookie di sessione ItalGiure.
 * Priorità: parametro esplicito > env var > file locale.
 */
export function getItalgiureCookie(cookie?: string): string | undefined {
  if (cookie) return cookie.trim();

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
export function isItalgiureConfigured(cookie?: string): boolean {
  return !!getItalgiureCookie(cookie);
}

/**
 * Crea un client HTTP per ItalGiure con SSL bypass per la CA non standard.
 */
function createItalgiureClient() {
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
    urlEcli?: string;
    urlGoogle: string;
    urlDuckDuckGo: string;
    istruzioni: string;
  };
}> {
  const cookie = getItalgiureCookie(input.cookie);
  const q = buildSolrQuery(input);
  const rows = input.pageSize ?? 20;
  const start = calculateStart(input.page, input.pageSize);

  // Fallback URL sempre pre-calcolati
  const params = new URLSearchParams();
  params.set('q', input.query);
  const urlRicerca = `${ITALGIURE_BASE}/isapi/hc.dll/sn.solr/sn-collection/select?app.query&${params.toString()}`;
  const urlItalgiure = `${ITALGIURE_BASE}/sncass.php?${new URLSearchParams({ q: input.query, tipo: 'massime' }).toString()}`;
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
        urlEcli,
        urlGoogle: google,
        urlDuckDuckGo: duckduckgo,
        istruzioni: 'Cookie di sessione ItalGiure non configurato. Per attivare la ricerca avanzata: 1) Accedi a https://www.italgiure.giustizia.it/sncass/ con SPID o credenziali professionali, 2) Esegui document.cookie nel browser, 3) Imposta la variabile d\'ambiente ITALGIURE_COOKIE o salva il valore in italgiure_cookie.txt.',
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
    const isAuthError = parsed.code === 'API_ERROR' && (parsed.message.includes('401') || parsed.message.includes('403'));

    if (isAuthError) {
      return {
        success: false,
        cookieValido: false,
        totale: 0,
        massime: [],
        fallback: {
          urlRicerca,
          urlItalgiure,
          urlEcli,
          urlGoogle: google,
          urlDuckDuckGo: duckduckgo,
          istruzioni: `Sessione ItalGiure scaduta o non valida (${parsed.message}). Aggiorna il cookie: 1) Naviga su https://www.italgiure.giustizia.it/sncass/ , 2) Esegui document.cookie, 3) Aggiorna ITALGIURE_COOKIE o italgiure_cookie.txt.`,
        },
      };
    }

    // Per altri errori (rete, timeout) restituiamo comunque i fallback
    return {
      success: false,
      cookieValido: false,
      totale: 0,
      massime: [],
      fallback: {
        urlRicerca,
        urlItalgiure,
        urlEcli,
        urlGoogle: google,
        urlDuckDuckGo: duckduckgo,
        istruzioni: `Errore nella ricerca ItalGiure: ${parsed.message}. Consulta i link di fallback o verifica la connessione.`,
      },
    };
  }
}

/**
 * Recupera una singola sentenza da ItalGiure per ID.
 */
export async function getSentenzaItalgiure(id: string, cookie?: string): Promise<{
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
    istruzioni: string;
  };
}> {
  const resolvedCookie = getItalgiureCookie(cookie);

  if (!resolvedCookie) {
    return {
      success: false,
      cookieValido: false,
      fallback: {
        urlItalgiure: `${ITALGIURE_BASE}/sncass.php`,
        istruzioni: 'Cookie di sessione ItalGiure non configurato. Per recuperare la sentenza: 1) Accedi a ItalGiure, 2) Esegui document.cookie, 3) Passa il cookie come parametro `cookie` o imposta ITALGIURE_COOKIE / italgiure_cookie.txt.',
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
            Cookie: resolvedCookie,
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
        messaggio: `Sentenza ${id} non trovata in ItalGiure. Verifica l'identificativo o cerca manualmente.`,
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
    const isAuthError = parsed.code === 'API_ERROR' && (parsed.message.includes('401') || parsed.message.includes('403'));

    return {
      success: false,
      cookieValido: false,
      fallback: {
        urlItalgiure: `${ITALGIURE_BASE}/sncass.php`,
        istruzioni: isAuthError
          ? `Sessione ItalGiure scaduta (${parsed.message}). Aggiorna il cookie via document.cookie e ITALGIURE_COOKIE.`
          : `Errore nel recupero sentenza: ${parsed.message}.`,
      },
    };
  }
}
