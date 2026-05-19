import * as cheerio from 'cheerio';
import { fetchWithRetry, parseApiError } from '@bettercallclaude-italia/shared';
import type { SearchSentenzeInput } from '../types.js';

/**
 * Search decisions from the Italian Administrative Justice system.
 * The portal uses a Liferay-based search at RicercaNew.
 */
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
  note: string;
}> {
  const params = new URLSearchParams();
  params.set('tipoRicerca', 'Provvedimenti');
  params.set('showadv', 'true');
  if (input.parolaChiave) params.set('testo', input.parolaChiave);
  if (input.organo) params.set('organo', input.organo);
  if (input.sezione) params.set('sezione', input.sezione);
  if (input.dataDa) params.set('dataDa', input.dataDa);
  if (input.dataA) params.set('dataA', input.dataA);

  const url = `https://www.giustizia-amministrativa.it/cdsintra/cdsintra/AmministrazionePortale/RicercaNew/index.html?${params.toString()}`;

  try {
    const html = await fetchWithRetry(
      'giustiziaamministrativa',
      () =>
        fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (BetterCallClaude-MCP/1.0)',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'it-IT,it;q=0.9',
          },
        }).then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        }),
      { retries: 2 }
    );

    const $ = cheerio.load(html);
    const sentenze: Array<Record<string, string | undefined>> = [];

    // Liferay result containers
    $('.risultato, .provvedimento, .search-results .result, table.risultati tbody tr').each((_i, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      const link = $el.find('a').attr('href');

      if (text && text.length > 20) {
        // Try to extract structured data
        const sezioneMatch = text.match(/Sezione[:\s]+([A-Za-z\s]+)/i);
        const dataMatch = text.match(/(\d{2}[\/\.-]\d{2}[\/\.-]\d{4})/);
        const nRegMatch = text.match(/N\.?\s*registro[:\s]*(\d+)/i);

        sentenze.push({
          id: nRegMatch?.[1],
          estremi: text.substring(0, 200),
          oggetto: text.substring(0, 400),
          sezione: sezioneMatch?.[1]?.trim(),
          data: dataMatch?.[1],
          url: link ? (link.startsWith('http') ? link : `https://www.giustizia-amministrativa.it${link}`) : undefined,
        });
      }
    });

    // Fallback: any substantial link in search results
    if (sentenze.length === 0) {
      $('a[href*="/RicercaNew/"], a[href*="/Provvedimento/"]').each((_i, el) => {
        const $el = $(el);
        const text = $el.text().trim();
        const href = $el.attr('href');
        if (text && text.length > 10 && !text.includes('Ricerca')) {
          sentenze.push({
            estremi: text.substring(0, 200),
            oggetto: text.substring(0, 400),
            url: href ? (href.startsWith('http') ? href : `https://www.giustizia-amministrativa.it${href}`) : undefined,
          });
        }
      });
    }

    return {
      sentenze: sentenze.slice(0, input.pageSize ?? 20),
      totali: sentenze.length,
      urlRicerca: url,
      note: sentenze.length > 0
        ? 'Risultati estratti euristicamente. Verificare sul portale ufficiale per la completezza.'
        : 'Nessun risultato trovato. Verificare i parametri di ricerca o consultare direttamente il portale.',
    };
  } catch (error) {
    const parsed = parseApiError(error);
    return {
      sentenze: [],
      totali: 0,
      urlRicerca: url,
      note: `${parsed.code}: ${parsed.message}. Usare l'URL di ricerca fornito per consultare direttamente il portale.`,
    };
  }
}
