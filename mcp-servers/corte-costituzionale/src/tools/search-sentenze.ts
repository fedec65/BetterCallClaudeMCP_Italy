import { fetchWithRetry, parseApiError, buildSearchEngineUrls, buildEcliUrlCorteCostituzionale } from '@bettercallclaude-italia/shared';
import type { SearchSentenzeInput } from '../types.js';

const SPARQL_ENDPOINT = 'https://dati.cortecostituzionale.it/sparql/endpoint';
const OPEN_DATA_URL = 'https://dati.cortecostituzionale.it';
const SITE_BASE = 'https://www.cortecostituzionale.it';

interface SparqlBinding {
  [key: string]: { value: string } | undefined;
}

/**
 * Query the Corte Costituzionale SPARQL endpoint.
 * May return empty if the endpoint is temporarily unavailable.
 */
async function queryOpenData(
  anno?: number,
  numero?: string,
  keyword?: string,
  limit = 20,
  offset = 0
): Promise<Array<{
  numero?: string;
  anno?: number;
  data?: string;
  oggetto?: string;
  url?: string;
}>> {
  const filters: string[] = [];
  if (anno) filters.push(`FILTER(?anno = ${anno})`);
  if (numero) filters.push(`FILTER(STR(?numero) = "${numero}")`);
  if (keyword) {
    const escaped = keyword.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    filters.push(`FILTER(CONTAINS(LCASE(STR(?epigrafe)), LCASE("${escaped}")))`);
  }

  const query = `
PREFIX dcc: <https://dati.cortecostituzionale.it/ontology/>
SELECT ?anno ?numero ?tipo ?data_decisione ?data_deposito ?epigrafe ?ecli
WHERE {
  ?s a dcc:Pronuncia .
  ?s dcc:anno ?anno .
  ?s dcc:numero ?numero .
  OPTIONAL { ?s dcc:tipo ?tipo }
  OPTIONAL { ?s dcc:data_decisione ?data_decisione }
  OPTIONAL { ?s dcc:data_deposito ?data_deposito }
  OPTIONAL { ?s dcc:epigrafe ?epigrafe }
  OPTIONAL { ?s dcc:ecli ?ecli }
  ${filters.join('\n  ')}
}
ORDER BY DESC(?anno) DESC(?numero)
LIMIT ${limit}
OFFSET ${offset}
  `.trim();

  const params = new URLSearchParams({ query, output: 'json' });

  const text = await fetchWithRetry(
    'cortecostituzionale',
    () =>
      fetch(`${SPARQL_ENDPOINT}?${params.toString()}`, {
        headers: {
          Accept: 'application/sparql-results+json',
          'User-Agent': 'BetterCallClaude-Italia-MCP/1.0.0',
        },
      }).then(async (res) => {
        if (!res.ok) throw new Error(`SPARQL HTTP ${res.status}`);
        return res.text();
      }),
    { retries: 1 }
  );

  if (!text || text.length === 0) return [];

  const json = JSON.parse(text) as {
    results?: { bindings?: SparqlBinding[] };
  };

  if (!json.results?.bindings?.length) return [];

  return json.results.bindings.map((b) => {
    const annoVal = b.anno?.value;
    const numeroVal = b.numero?.value;
    return {
      numero: numeroVal,
      anno: annoVal ? parseInt(annoVal, 10) : undefined,
      data: b.data_decisione?.value || b.data_deposito?.value,
      oggetto: b.epigrafe?.value?.substring(0, 300),
      url: annoVal && numeroVal
        ? `${SITE_BASE}/actionSchedaPronuncia.do?param_ecli=ECLI:IT:COST:${annoVal}:${numeroVal}`
        : undefined,
    };
  });
}

export async function searchSentenze(input: SearchSentenzeInput): Promise<{
  sentenze: Array<{
    numero?: string;
    anno?: number;
    data?: string;
    oggetto?: string;
    url?: string;
  }>;
  totali: number;
  urlRicerca: string;
  urlConsultazione: string;
  urlEcli?: string;
  urlGoogle: string;
  urlDuckDuckGo: string;
  note: string;
}> {
  // Build consultation/fallback URLs (backward-compatible)
  const params = new URLSearchParams();
  if (input.numero) params.set('numero', input.numero);
  if (input.anno) params.set('anno', String(input.anno));
  const ricerca = `${SITE_BASE}/actionPronuncia.do?${params.toString()}`;

  const consultazione = input.anno && input.numero
    ? `${SITE_BASE}/actionSchedaPronuncia.do?param_ecli=ECLI:IT:COST:${input.anno}:${input.numero}`
    : `${SITE_BASE}/actionPronuncia.do`;

  const urlEcli = input.anno && input.numero
    ? buildEcliUrlCorteCostituzionale(input.anno, input.numero)
    : undefined;

  const { google, duckduckgo } = buildSearchEngineUrls('cortecostituzionale.it', [
    input.numero ? `sentenza n.${input.numero}` : '',
    input.anno ? String(input.anno) : '',
    input.parolaChiave || '',
    input.materia || '',
  ]);

  try {
    const pageSize = input.pageSize ?? 20;
    const page = input.page ?? 1;
    const offset = (page - 1) * pageSize;

    const sentenze = await queryOpenData(
      input.anno,
      input.numero,
      input.parolaChiave || input.materia,
      pageSize,
      offset
    );

    if (sentenze.length > 0) {
      return {
        sentenze,
        totali: sentenze.length,
        urlRicerca: ricerca,
        urlConsultazione: consultazione,
        urlEcli,
        urlGoogle: google,
        urlDuckDuckGo: duckduckgo,
        note: 'Risultati da Open Data Corte Costituzionale (dati.cortecostituzionale.it, CC BY-SA 3.0). Aggiornamento settimanale.',
      };
    }

    return {
      sentenze: [],
      totali: 0,
      urlRicerca: ricerca,
      urlConsultazione: consultazione,
      urlEcli,
      urlGoogle: google,
      urlDuckDuckGo: duckduckgo,
      note: `L'endpoint Open Data non ha restituito risultati. Consultare: 1) Open Data ${OPEN_DATA_URL}, 2) ECLI diretto, 3) Google site-search.`,
    };
  } catch (error) {
    const parsed = parseApiError(error);
    return {
      sentenze: [],
      totali: 0,
      urlRicerca: ricerca,
      urlConsultazione: consultazione,
      urlEcli,
      urlGoogle: google,
      urlDuckDuckGo: duckduckgo,
      note: `Errore Open Data (${parsed.code}): ${parsed.message}. Consultare: ${OPEN_DATA_URL} oppure ECLI/Google.`,
    };
  }
}
