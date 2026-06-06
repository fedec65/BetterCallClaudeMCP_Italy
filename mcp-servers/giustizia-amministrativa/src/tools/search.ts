import { fetchWithRetry, parseApiError, buildSearchEngineUrls } from '@bettercallclaude-italia/shared';
import type { SearchSentenzeInput } from '../types.js';

const CKAN_BASE = 'https://openga.giustizia-amministrativa.it/api/3/action';

/**
 * Map organo filter to CKAN dataset name prefix.
 * OpenGA organises datasets per sede (CdS, CGA, TAR-*).
 */
function getDatasetPrefix(organo?: string): string {
  if (organo === 'CONSIGLIO_DI_STATO') return 'cds';
  // TAR datasets are per-region; default search across all
  return '';
}

interface CkanRecord {
  _id?: number;
  TIPO_PROVVEDIMENTO?: string;
  CODICE_SEDE?: string;
  NOME_SEDE?: string;
  CODICE_SEZIONE?: string;
  NOME_SEZIONE?: string;
  NUMERO_PROVVEDIMENTO?: number;
  NUMERO_RICORSO?: number;
  ANNO_PUBBLICAZIONE?: number;
  MESE_PUBBLICAZIONE?: number;
  DATA_PUBBLICAZIONE?: string;
  TIPO_UDIENZA?: string;
  ESITO_PROVVEDIMENTO?: string;
  FLG_DEFINISCE?: string;
  DATA_DEPOSITO_RICORSO?: string;
  OGGETTO_RICORSO?: string;
  TIPO_RICORSO?: string;
  NUM_MEMBRI_COLLEGIO?: number;
}

interface CkanDatastoreResponse {
  success: boolean;
  result: {
    total: number;
    records: CkanRecord[];
  };
}

interface CkanPackageListResponse {
  success: boolean;
  result: string[];
}

interface CkanPackageShowResponse {
  success: boolean;
  result: {
    name: string;
    resources: Array<{
      id: string;
      name: string;
      format: string;
      url: string;
    }>;
  };
}

/**
 * Find the resource IDs for sentenze datasets matching the organo filter.
 * Caches the resolution per session (datasets don't change often).
 */
const datasetResourceCache = new Map<string, string[]>();

async function findSentenzeResourceIds(organo?: string, anno?: number): Promise<string[]> {
  const cacheKey = `${organo || 'all'}_${anno || 'all'}`;
  if (datasetResourceCache.has(cacheKey)) {
    return datasetResourceCache.get(cacheKey)!;
  }

  const prefix = getDatasetPrefix(organo);

  // List all datasets that contain "sentenze" in the name
  const packageList = await fetchWithRetry(
    'giustiziaamministrativa',
    () =>
      fetch(`${CKAN_BASE}/package_list`, {
        headers: { Accept: 'application/json', 'User-Agent': 'BetterCallClaude-Italia-MCP/1.0.0' },
      }).then(async (res) => {
        if (!res.ok) throw new Error(`CKAN package_list HTTP ${res.status}`);
        return res.json() as Promise<CkanPackageListResponse>;
      }),
    { retries: 2 }
  );

  if (!packageList.success) return [];

  // Filter dataset names: must contain "sentenze" and optionally match prefix
  const matchingDatasets = packageList.result.filter((name) => {
    if (!name.includes('sentenze')) return false;
    if (name.includes('classificazione')) return false;
    if (prefix && !name.startsWith(prefix)) return false;
    return true;
  });

  // Get resources from each matching dataset
  const resourceIds: string[] = [];
  const currentYear = new Date().getFullYear();
  const targetYear = anno || currentYear;

  for (const datasetName of matchingDatasets.slice(0, 5)) {
    const pkg = await fetchWithRetry(
      'giustiziaamministrativa',
      () =>
        fetch(`${CKAN_BASE}/package_show?id=${datasetName}`, {
          headers: { Accept: 'application/json', 'User-Agent': 'BetterCallClaude-Italia-MCP/1.0.0' },
        }).then(async (res) => {
          if (!res.ok) throw new Error(`CKAN package_show HTTP ${res.status}`);
          return res.json() as Promise<CkanPackageShowResponse>;
        }),
      { retries: 1 }
    );

    if (!pkg.success) continue;

    // Pick the CSV resource for the target year (CSV resources have datastore)
    for (const resource of pkg.result.resources) {
      if (resource.format === 'CSV' && resource.name.includes(String(targetYear))) {
        resourceIds.push(resource.id);
      }
    }

    // Fallback: if no year match, pick the most recent CSV
    if (resourceIds.length === 0) {
      const csvResources = pkg.result.resources
        .filter((r) => r.format === 'CSV')
        .sort((a, b) => b.name.localeCompare(a.name));
      const first = csvResources[0];
      if (first) {
        resourceIds.push(first.id);
      }
    }
  }

  datasetResourceCache.set(cacheKey, resourceIds);
  return resourceIds;
}

/**
 * Search the CKAN Datastore for sentenze matching the input.
 */
async function searchCkanDatastore(
  resourceId: string,
  keyword?: string,
  limit = 20,
  offset = 0,
  dataDa?: string,
  dataA?: string,
): Promise<{ total: number; records: CkanRecord[] }> {
  const params = new URLSearchParams();
  params.set('resource_id', resourceId);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  if (keyword) params.set('q', keyword);

  const response = await fetchWithRetry(
    'giustiziaamministrativa',
    () =>
      fetch(`${CKAN_BASE}/datastore_search?${params.toString()}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'BetterCallClaude-Italia-MCP/1.0.0' },
      }).then(async (res) => {
        if (!res.ok) throw new Error(`CKAN datastore_search HTTP ${res.status}`);
        return res.json() as Promise<CkanDatastoreResponse>;
      }),
    { retries: 2 }
  );

  if (!response.success) return { total: 0, records: [] };

  let records = response.result.records;

  // Client-side date filtering if needed
  if (dataDa) {
    records = records.filter((r) => !r.DATA_PUBBLICAZIONE || r.DATA_PUBBLICAZIONE >= dataDa);
  }
  if (dataA) {
    records = records.filter((r) => !r.DATA_PUBBLICAZIONE || r.DATA_PUBBLICAZIONE <= dataA);
  }

  return {
    total: response.result.total,
    records,
  };
}

export async function searchGiustiziaAmministrativa(input: SearchSentenzeInput): Promise<{
  sentenze: Array<{
    id?: string;
    estremi?: string;
    oggetto?: string;
    sezione?: string;
    organo?: string;
    data?: string;
    url?: string;
  }>;
  totali: number;
  urlRicerca: string;
  urlGoogle: string;
  urlDuckDuckGo: string;
  note: string;
}> {
  const urlOpenGA = 'https://openga.giustizia-amministrativa.it';

  const { google, duckduckgo } = buildSearchEngineUrls('giustizia-amministrativa.it', [
    input.parolaChiave || '',
    input.organo || '',
    input.sezione || '',
    input.dataDa ? `dal ${input.dataDa}` : '',
    input.dataA ? `al ${input.dataA}` : '',
  ]);

  try {
    const pageSize = input.pageSize ?? 20;
    const page = input.page ?? 1;
    const offset = (page - 1) * pageSize;

    // Find relevant CKAN dataset resource IDs
    const anno = input.dataDa ? parseInt(input.dataDa.substring(0, 4), 10) : undefined;
    const resourceIds = await findSentenzeResourceIds(input.organo, anno);

    if (resourceIds.length === 0) {
      return {
        sentenze: [],
        totali: 0,
        urlRicerca: urlOpenGA,
        urlGoogle: google,
        urlDuckDuckGo: duckduckgo,
        note: `Nessun dataset trovato su OpenGA. Consultare direttamente: ${urlOpenGA}`,
      };
    }

    // Search across the first matching resource
    const firstResourceId = resourceIds[0];
    if (!firstResourceId) {
      return {
        sentenze: [],
        totali: 0,
        urlRicerca: urlOpenGA,
        urlGoogle: google,
        urlDuckDuckGo: duckduckgo,
        note: `Nessuna risorsa CSV trovata su OpenGA. Consultare direttamente: ${urlOpenGA}`,
      };
    }

    const result = await searchCkanDatastore(
      firstResourceId,
      input.parolaChiave,
      pageSize,
      offset,
      input.dataDa,
      input.dataA,
    );

    const sentenze = result.records.map((r) => ({
      id: r.NUMERO_PROVVEDIMENTO ? String(r.NUMERO_PROVVEDIMENTO) : undefined,
      estremi: [
        r.TIPO_PROVVEDIMENTO,
        r.NUMERO_PROVVEDIMENTO ? `n. ${r.NUMERO_PROVVEDIMENTO}` : undefined,
        r.DATA_PUBBLICAZIONE,
      ].filter(Boolean).join(' - '),
      oggetto: r.OGGETTO_RICORSO?.substring(0, 400),
      sezione: r.NOME_SEZIONE,
      organo: r.NOME_SEDE,
      data: r.DATA_PUBBLICAZIONE,
      url: urlOpenGA,
    }));

    return {
      sentenze,
      totali: result.total,
      urlRicerca: urlOpenGA,
      urlGoogle: google,
      urlDuckDuckGo: duckduckgo,
      note: `Risultati da Open Data Giustizia Amministrativa (openga.giustizia-amministrativa.it, CC BY 4.0). Dati aggiornati mensilmente.`,
    };
  } catch (error) {
    const parsed = parseApiError(error);
    return {
      sentenze: [],
      totali: 0,
      urlRicerca: urlOpenGA,
      urlGoogle: google,
      urlDuckDuckGo: duckduckgo,
      note: `Errore Open Data (${parsed.code}): ${parsed.message}. Consultare: ${urlOpenGA} oppure Google/DuckDuckGo.`,
    };
  }
}
