import { fetchWithRetry, parseApiError } from '@bettercallclaude-italia/shared';
import type { ElencoTipiInput } from '../types.js';

const NORMATTIVA_API_BASE =
  process.env.NORMATTIVA_API_BASE || 'https://api.normattiva.it/t/normattiva.api';

export async function elencoTipiNormattiva(
  input: ElencoTipiInput
): Promise<{ tipi: Array<{ id: string; nome: string }> }> {
  const endpoints: Record<string, string> = {
    classe: '/bff-opendata/v1/api/v1/tipologiche/classe-provvedimento',
    denominazione: '/bff-opendata/v1/api/v1/tipologiche/denominazione-atto',
    estensioni: '/bff-opendata/v1/api/v1/tipologiche/estensioni',
  };

  const url = `${NORMATTIVA_API_BASE}${endpoints[input.tipo]}`;

  try {
    const response = (await fetchWithRetry(
      'normattiva',
      () =>
        fetch(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        }).then(async (res) => {
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`HTTP ${res.status}: ${text}`);
          }
          return res.json() as Promise<Array<Record<string, unknown>>>;
        }),
      { retries: 3 }
    )) as Array<Record<string, unknown>>;

    const items = Array.isArray(response) ? response : [];

    return {
      tipi: items.map((t: Record<string, unknown>) => ({
        id: String(t.label ?? t.value ?? t.codice ?? ''),
        nome: String(t.value ?? t.label ?? t.descrizione ?? ''),
      })),
    };
  } catch (error) {
    const parsed = parseApiError(error);
    throw new Error(`[normattiva_elenco_tipi] ${parsed.code}: ${parsed.message}`);
  }
}
