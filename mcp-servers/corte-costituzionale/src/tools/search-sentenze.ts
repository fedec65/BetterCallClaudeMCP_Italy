import { parseApiError, buildSearchEngineUrls, buildEcliUrlCorteCostituzionale } from '@bettercallclaude-italia/shared';
import type { SearchSentenzeInput } from '../types.js';
import { searchPronunce } from './opendata-cache.js';

const OPEN_DATA_URL = 'https://dati.cortecostituzionale.it';
const SITE_BASE = 'https://www.cortecostituzionale.it';

export async function searchSentenze(input: SearchSentenzeInput): Promise<{
  sentenze: Array<{
    numero?: string;
    anno?: number;
    data?: string;
    oggetto?: string;
    url?: string;
    tipo?: string;
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

    const { results, total } = await searchPronunce({
      anno: input.anno,
      numero: input.numero,
      keyword: input.parolaChiave || input.materia,
      limit: pageSize,
      offset,
    });

    if (results.length > 0) {
      const sentenze = results.map(p => ({
        numero: p.numero_pronuncia,
        anno: p.anno_pronuncia ? parseInt(p.anno_pronuncia, 10) : undefined,
        data: p.data_decisione || p.data_deposito,
        oggetto: p.epigrafe?.replace(/&#13;/g, '').replace(/\r\n/g, ' ').substring(0, 300),
        url: p.anno_pronuncia && p.numero_pronuncia
          ? `${SITE_BASE}/actionSchedaPronuncia.do?param_ecli=ECLI:IT:COST:${p.anno_pronuncia}:${p.numero_pronuncia}`
          : undefined,
        tipo: p.tipologia_pronuncia,
      }));

      return {
        sentenze,
        totali: total,
        urlRicerca: ricerca,
        urlConsultazione: consultazione,
        urlEcli,
        urlGoogle: google,
        urlDuckDuckGo: duckduckgo,
        note: `Risultati da Open Data Corte Costituzionale (${OPEN_DATA_URL}, CC BY-SA 3.0). Dataset JSON aggiornato settimanalmente.`,
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
      note: `Nessun risultato trovato nel dataset Open Data. Consultare: 1) ${OPEN_DATA_URL}, 2) Google site-search.`,
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
      note: `Errore Open Data (${parsed.code}): ${parsed.message}. Consultare: ${OPEN_DATA_URL} oppure Google.`,
    };
  }
}
