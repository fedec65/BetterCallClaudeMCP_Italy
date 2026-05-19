import * as cheerio from 'cheerio';
import { fetchWithRetry, parseApiError } from '@bettercallclaude-italia/shared';
import type { SearchMassimeInput } from '../types.js';

/**
 * Search Cassation Court decisions and maxims.
 * The main portal (cortedicassazione.it) has strict access controls.
 * We attempt public access and provide fallback URLs.
 */
export async function searchMassime(input: SearchMassimeInput): Promise<{
  massime: Array<{
    estremi?: string;
    massima?: string;
    url?: string;
  }>;
  totali: number;
  urlRicerca: string;
  urlItalgiure: string;
  note: string;
}> {
  // Try the public search page
  const params = new URLSearchParams();
  params.set('q', input.query);
  const urlRicerca = `https://www.cortedicassazione.it/corte-di-cassazione/it/sentenzeW.html?${params.toString()}`;

  // ItalGiure search URL (requires institutional access for full text)
  const urlItalgiure = `https://www.italgiure.giustizia.it/sncass/sncass.php?` +
    new URLSearchParams({ q: input.query, tipo: 'massime' }).toString();

  try {
    const html = await fetchWithRetry(
      'cassazione',
      () =>
        fetch(urlRicerca, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (BetterCallClaude-MCP/1.0)',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'it-IT,it;q=0.9',
          },
        }).then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        }),
      { retries: 1 }
    );

    // Check for bot protection or access denied
    if (html.includes('403') || html.includes('Forbidden') || html.includes('security') || html.length < 500) {
      return {
        massime: [],
        totali: 0,
        urlRicerca,
        urlItalgiure,
        note: 'Il portale della Corte di Cassazione ha attivato protezione anti-bot o restrizioni di accesso. Si consiglia di consultare direttamente gli URL forniti.',
      };
    }

    const $ = cheerio.load(html);
    const massime: Array<Record<string, string | undefined>> = [];

    $('table tr, .sentenza, .risultato, .massima, .decisione').each((_i, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      const link = $el.find('a').attr('href');
      if (text && text.length > 20) {
        massime.push({
          estremi: text.substring(0, 150),
          massima: text.substring(0, 400),
          url: link ? (link.startsWith('http') ? link : `https://www.cortedicassazione.it${link}`) : undefined,
        });
      }
    });

    return {
      massime: massime.slice(0, input.pageSize ?? 20),
      totali: massime.length,
      urlRicerca,
      urlItalgiure,
      note: massime.length > 0
        ? 'Risultati estratti dalla porzione pubblica. Accesso completo riservato agli operatori giuridici su ItalGiure.'
        : 'Nessun risultato estratto. Consultare direttamente il portale o ItalGiure.',
    };
  } catch (error) {
    const parsed = parseApiError(error);
    return {
      massime: [],
      totali: 0,
      urlRicerca,
      urlItalgiure,
      note: `${parsed.code}: ${parsed.message}. Il portale della Corte di Cassazione ha restrizioni di accesso. Per ricerche complete utilizzare ItalGiure (accesso riservato agli operatori del diritto).`,
    };
  }
}
