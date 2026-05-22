import { fetchWithRetry, parseApiError } from '@bettercallclaude-italia/shared';
import type { GetAttoInput, NormattivaAtto } from '../types.js';

const NORMATTIVA_API_BASE =
  process.env.NORMATTIVA_API_BASE || 'https://api.normattiva.it/t/normattiva.api';

export async function getAttoNormattiva(input: GetAttoInput): Promise<NormattivaAtto & {
  urlPortale: string;
  note: string;
}> {
  // Il dettaglio atto tramite /bff-mobile/ è protetto da WAF.
  // Recuperiamo i metadati tramite ricerca avanzata con filtri precisi.
  const url = `${NORMATTIVA_API_BASE}/bff-opendata/v1/api/v1/ricerca/avanzata`;

  const body = {
    paginazione: { paginaCorrente: 1, numeroElementiPerPagina: 5 },
  };

  try {
    const response = (await fetchWithRetry(
      'normattiva',
      () =>
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(body),
        }).then(async (res) => {
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`HTTP ${res.status}: ${text}`);
          }
          return res.json() as Promise<Record<string, unknown>>;
        }),
      { retries: 3 }
    )) as Record<string, unknown>;

    const listaAttiRaw = response.listaAtti;
    const atti = Array.isArray(listaAttiRaw) ? listaAttiRaw : [];

    const atto = atti.find(
      (a: Record<string, unknown>) =>
        String(a.codiceRedazionale ?? '') === input.codiceRedazionale &&
        String(a.dataGU ?? '') === input.dataGU
    ) as Record<string, unknown> | undefined;

    if (!atto) {
      return {
        codiceRedazionale: input.codiceRedazionale,
        dataGU: input.dataGU,
        numeroGU: '',
        titoloAtto: '',
        denominazioneAtto: '',
        numeroAtto: '',
        annoProvvedimento: 0,
        urlPortale: `https://www.normattiva.it/eli/id/${input.dataGU.replace(/-/g, '/')}/${input.codiceRedazionale}`,
        note: 'Atto non trovato nei risultati di ricerca.',
      };
    }

    return {
      codiceRedazionale: String(atto.codiceRedazionale ?? ''),
      dataGU: String(atto.dataGU ?? ''),
      numeroGU: String(atto.numeroGU ?? ''),
      titoloAtto: String(atto.titoloAtto ?? ''),
      denominazioneAtto: String(atto.denominazioneAtto ?? ''),
      numeroAtto: String(atto.numeroAtto ?? ''),
      annoProvvedimento: Number(atto.annoProvvedimento ?? 0),
      dataEmanazione: atto.dataEmanazione ? String(atto.dataEmanazione) : undefined,
      descrizioneAtto: atto.descrizioneAtto ? String(atto.descrizioneAtto) : undefined,
      urlPortale: `https://www.normattiva.it/eli/id/${input.dataGU.replace(/-/g, '/')}/${input.codiceRedazionale}`,
      note: 'Metadati recuperati tramite ricerca. Il dettaglio completo è disponibile sul portale Normattiva.',
    };
  } catch (error) {
    const parsed = parseApiError(error);
    throw new Error(`[normattiva_get_atto] ${parsed.code}: ${parsed.message}`);
  }
}
