import { fetchWithRetry, parseApiError } from '@bettercallclaude-italia/shared';
import type { GetSentenzaInput } from '../types.js';

const SPARQL_ENDPOINT = 'https://dati.cortecostituzionale.it/sparql/endpoint';
const SITE_BASE = 'https://www.cortecostituzionale.it';
const OPEN_DATA_URL = 'https://dati.cortecostituzionale.it';

interface SparqlBinding {
  [key: string]: { value: string } | undefined;
}

/**
 * Try to retrieve the full text of a pronouncement via the SPARQL endpoint.
 */
async function getFromSparql(anno: number, numero: string): Promise<{
  testo?: string;
  epigrafe?: string;
  tipo?: string;
  data_decisione?: string;
  ecli?: string;
} | null> {
  const query = `
PREFIX dcc: <https://dati.cortecostituzionale.it/ontology/>
SELECT ?testo ?epigrafe ?tipo ?data_decisione ?ecli
WHERE {
  ?s a dcc:Pronuncia .
  ?s dcc:anno ${anno} .
  ?s dcc:numero "${numero}" .
  OPTIONAL { ?s dcc:testo ?testo }
  OPTIONAL { ?s dcc:epigrafe ?epigrafe }
  OPTIONAL { ?s dcc:tipo ?tipo }
  OPTIONAL { ?s dcc:data_decisione ?data_decisione }
  OPTIONAL { ?s dcc:ecli ?ecli }
}
LIMIT 1
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

  if (!text || text.length === 0) return null;

  const json = JSON.parse(text) as {
    results?: { bindings?: SparqlBinding[] };
  };

  const b = json.results?.bindings?.[0];
  if (!b) return null;

  return {
    testo: b.testo?.value,
    epigrafe: b.epigrafe?.value,
    tipo: b.tipo?.value,
    data_decisione: b.data_decisione?.value,
    ecli: b.ecli?.value,
  };
}

export async function getSentenza(input: GetSentenzaInput): Promise<{
  numero: string;
  anno: number;
  url?: string;
  urlConsultazione?: string;
  testo?: string;
  note: string;
}> {
  const ecli = `ECLI:IT:COST:${input.anno}:${input.numero}`;
  const url = `${SITE_BASE}/actionSchedaPronuncia.do?param_ecli=${ecli}`;
  const urlConsultazione = `${SITE_BASE}/actionPronuncia.do?numero=${input.numero}&anno=${input.anno}`;

  try {
    // Try SPARQL endpoint for the full text
    const sparqlResult = await getFromSparql(input.anno, input.numero);

    if (sparqlResult?.testo) {
      return {
        numero: input.numero,
        anno: input.anno,
        url,
        urlConsultazione,
        testo: sparqlResult.testo.substring(0, 8000),
        note: `Testo integrale da Open Data Corte Costituzionale (${OPEN_DATA_URL}, CC BY-SA 3.0).`,
      };
    }

    // SPARQL returned empty or no text — provide URLs for manual consultation
    return {
      numero: input.numero,
      anno: input.anno,
      url,
      urlConsultazione,
      testo: sparqlResult?.epigrafe || '',
      note: `Testo integrale non disponibile via Open Data. Consultare direttamente: ${url}`,
    };
  } catch (error) {
    const parsed = parseApiError(error);
    return {
      numero: input.numero,
      anno: input.anno,
      url,
      urlConsultazione,
      testo: '',
      note: `Errore Open Data (${parsed.code}): ${parsed.message}. Consultare: ${url}`,
    };
  }
}
