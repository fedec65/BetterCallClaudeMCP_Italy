import { fetchWithRetry, parseApiError } from '@bettercallclaude-italia/shared';
import type { SearchInput, SearchResult } from '../types.js';

const NORMATTIVA_API_BASE =
  process.env.NORMATTIVA_API_BASE || 'https://api.normattiva.it/t/normattiva.api';

export async function searchNormattiva(input: SearchInput): Promise<SearchResult> {
  const url = `${NORMATTIVA_API_BASE}/bff-opendata/v1/api/v1/ricerca/semplice`;

  const body: Record<string, unknown> = {
    testoRicerca: input.query,
    orderType: input.orderType ?? 'recente',
    paginazione: {
      paginaCorrente: input.page ?? 1,
      numeroElementiPerPagina: input.pageSize ?? 20,
    },
  };

  if (input.annoProvvedimento) {
    body.filtriMap = {
      ...(body.filtriMap as Record<string, unknown> ?? {}),
      anno_provvedimento: input.annoProvvedimento,
    };
  }
  if (input.codiceTipoProvvedimento) {
    body.filtriMap = {
      ...(body.filtriMap as Record<string, unknown> ?? {}),
      codice_tipo_provvedimento: input.codiceTipoProvvedimento,
    };
  }

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
    const totaliRaw = response.totali;
    const totali = typeof totaliRaw === 'number' ? totaliRaw : atti.length;

    return {
      atti: atti.map((a: Record<string, unknown>) => ({
        codiceRedazionale: String(a.codiceRedazionale ?? ''),
        dataGU: String(a.dataGU ?? ''),
        numeroGU: String(a.numeroGU ?? ''),
        titoloAtto: String(a.titoloAtto ?? ''),
        denominazioneAtto: String(a.denominazioneAtto ?? ''),
        numeroAtto: String(a.numeroAtto ?? ''),
        annoProvvedimento: Number(a.annoProvvedimento ?? 0),
        dataEmanazione: a.dataEmanazione ? String(a.dataEmanazione) : undefined,
        descrizioneAtto: a.descrizioneAtto ? String(a.descrizioneAtto) : undefined,
        urlNormattiva: a.codiceRedazionale && a.dataGU
          ? `https://www.normattiva.it/eli/id/${String(a.dataGU).replace(/-/g, '/')}/${String(a.codiceRedazionale)}`
          : undefined,
      })),
      totali,
      pagina: input.page ?? 1,
      pageSize: input.pageSize ?? 20,
    };
  } catch (error) {
    const parsed = parseApiError(error);
    throw new Error(`[normattiva_search] ${parsed.code}: ${parsed.message}`);
  }
}
