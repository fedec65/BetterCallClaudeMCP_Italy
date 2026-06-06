import { fetchWithRetry, parseApiError } from '@bettercallclaude-italia/shared';
import type { GetSentenzaInput } from '../types.js';

const CKAN_BASE = 'https://openga.giustizia-amministrativa.it/api/3/action';

interface CkanProvvedimentoRecord {
  TIPO_PROVVEDIMENTO?: string;
  NUMERO_PROVVEDIMENTO?: number;
  NOME_SEDE?: string;
  NOME_SEZIONE?: string;
  DATA_PUBBLICAZIONE?: string;
  ESITO_PROVVEDIMENTO?: string;
  OGGETTO_RICORSO?: string;
  TIPO_RICORSO?: string;
  [key: string]: unknown;
}

interface CkanDatastoreResponse {
  success: boolean;
  result: {
    total: number;
    records: CkanProvvedimentoRecord[];
  };
}

export async function getSentenzaGiustiziaAmministrativa(input: GetSentenzaInput): Promise<{
  id: string;
  url?: string;
  testo?: string;
  dettagli?: CkanProvvedimentoRecord;
  note?: string;
}> {
  const urlOpenGA = `https://openga.giustizia-amministrativa.it`;

  try {
    // Try to find the record by NUMERO_PROVVEDIMENTO in the CKAN datastore
    // The id could be a CKAN resource_id:record_id or just a provvedimento number
    const numero = parseInt(input.id, 10);

    if (!isNaN(numero)) {
      // Search across CdS sentenze (most common) for the provvedimento number
      // Try the current year first, then expand
      const currentYear = new Date().getFullYear();
      const years = [currentYear, currentYear - 1, currentYear - 2];

      for (const year of years) {
        const response = await fetchWithRetry(
          'giustiziaamministrativa',
          () =>
            fetch(`${CKAN_BASE}/package_show?id=cds-sentenze`, {
              headers: { Accept: 'application/json', 'User-Agent': 'BetterCallClaude-Italia-MCP/1.0.0' },
            }).then(async (res) => {
              if (!res.ok) throw new Error(`CKAN HTTP ${res.status}`);
              return res.json() as Promise<{
                success: boolean;
                result: {
                  resources: Array<{ id: string; name: string; format: string }>;
                };
              }>;
            }),
          { retries: 1 }
        );

        if (!response.success) continue;

        const csvResource = response.result.resources.find(
          (r) => r.format === 'CSV' && r.name.includes(String(year))
        );

        if (!csvResource) continue;

        const dsResult = await fetchWithRetry(
          'giustiziaamministrativa',
          () =>
            fetch(
              `${CKAN_BASE}/datastore_search?resource_id=${csvResource.id}&filters=${encodeURIComponent(JSON.stringify({ NUMERO_PROVVEDIMENTO: numero }))}`,
              {
                headers: { Accept: 'application/json', 'User-Agent': 'BetterCallClaude-Italia-MCP/1.0.0' },
              }
            ).then(async (res) => {
              if (!res.ok) throw new Error(`CKAN datastore_search HTTP ${res.status}`);
              return res.json() as Promise<CkanDatastoreResponse>;
            }),
          { retries: 1 }
        );

        const record = dsResult.success ? dsResult.result.records[0] : undefined;
        if (record) {
          return {
            id: input.id,
            url: urlOpenGA,
            dettagli: record,
            testo: [
              `${record.TIPO_PROVVEDIMENTO ?? ''} n. ${record.NUMERO_PROVVEDIMENTO ?? ''}`,
              `Sede: ${record.NOME_SEDE ?? ''}`,
              `Sezione: ${record.NOME_SEZIONE ?? ''}`,
              `Data pubblicazione: ${record.DATA_PUBBLICAZIONE ?? ''}`,
              `Esito: ${record.ESITO_PROVVEDIMENTO ?? ''}`,
              `Oggetto: ${record.OGGETTO_RICORSO ?? ''}`,
              `Tipo ricorso: ${record.TIPO_RICORSO ?? ''}`,
            ].join('\n'),
            note: 'Dati da Open Data Giustizia Amministrativa (openga.giustizia-amministrativa.it, CC BY 4.0). Il testo integrale del provvedimento non è disponibile via open data; consultare il portale ufficiale.',
          };
        }
      }
    }

    // No match found in CKAN — provide URL for manual lookup
    return {
      id: input.id,
      url: `https://www.giustizia-amministrativa.it/cdsintra/cdsintra/AmministrazionePortale/Ricerca/dettaglio.html?id=${encodeURIComponent(input.id)}`,
      testo: '',
      note: `Provvedimento non trovato in Open Data. Consultare il portale: ${urlOpenGA} o giustizia-amministrativa.it`,
    };
  } catch (error) {
    const parsed = parseApiError(error);
    return {
      id: input.id,
      url: `https://www.giustizia-amministrativa.it/cdsintra/cdsintra/AmministrazionePortale/Ricerca/dettaglio.html?id=${encodeURIComponent(input.id)}`,
      testo: '',
      note: `Errore Open Data (${parsed.code}): ${parsed.message}. Consultare il portale direttamente.`,
    };
  }
}
