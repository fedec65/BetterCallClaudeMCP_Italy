import * as cheerio from 'cheerio';
import { fetchWithRetry, parseApiError } from '@bettercallclaude-italia/shared';
import type { SearchSentenzeInput } from '../types.js';

/**
 * Build direct search URLs for the Constitutional Court website.
 * The main site has anti-bot protection (DataDome), so we provide
 * direct consultation URLs as primary fallback.
 */
function buildSearchUrls(input: SearchSentenzeInput): {
  ricerca: string;
  consultazione: string;
} {
  const base = 'https://www.cortecostituzionale.it';

  // Direct pronuncia search URL
  const params = new URLSearchParams();
  if (input.numero) params.set('numero', input.numero);
  if (input.anno) params.set('anno', String(input.anno));
  const ricerca = `${base}/actionPronuncia.do?${params.toString()}`;

  // Consultation page (English decisions portal, often less restricted)
  const consultazione = input.anno && input.numero
    ? `${base}/actionSchedaPronuncia.do?param_ecli=ECLI:IT:COST:${input.anno}:${input.numero}`
    : `${base}/actionPronuncia.do`;

  return { ricerca, consultazione };
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
  note: string;
}> {
  const { ricerca, consultazione } = buildSearchUrls(input);

  try {
    const html = await fetchWithRetry(
      'cortecostituzionale',
      () =>
        fetch(ricerca, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
            Referer: 'https://www.cortecostituzionale.it/',
          },
        }).then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        }),
      { retries: 1 }
    );

    const $ = cheerio.load(html);
    const sentenze: Array<Record<string, string | number | undefined>> = [];

    // Multiple heuristics for different page structures
    // Heuristic 1: table rows with pronuncia data
    $('table tbody tr, .risultati li, .pronuncia, .card').each((_i, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      const link = $el.find('a').attr('href');

      if (text && (text.includes('Sentenza') || text.includes('Ordinanza') || /n\.?\s*\d+\/\d{4}/.test(text))) {
        const numMatch = text.match(/n\.?\s*(\d+)/i);
        const annoMatch = text.match(/(\d{4})/);
        const dataMatch = text.match(/(\d{2}[\/\.-]\d{2}[\/\.-]\d{4})/);

        sentenze.push({
          numero: numMatch?.[1],
          anno: annoMatch?.[1] ? parseInt(annoMatch[1], 10) : undefined,
          data: dataMatch?.[1],
          oggetto: text.substring(0, 300),
          url: link ? (link.startsWith('http') ? link : `https://www.cortecostituzionale.it${link}`) : undefined,
        });
      }
    });

    // Heuristic 2: look for structured data in links
    if (sentenze.length === 0) {
      $('a[href*="actionSchedaPronuncia"], a[href*="pronuncia"]').each((_i, el) => {
        const $el = $(el);
        const text = $el.text().trim();
        const href = $el.attr('href');
        if (text && text.length > 5) {
          const numMatch = text.match(/n\.?\s*(\d+)/i);
          const annoMatch = text.match(/(\d{4})/);
          sentenze.push({
            numero: numMatch?.[1],
            anno: annoMatch?.[1] ? parseInt(annoMatch[1], 10) : undefined,
            oggetto: text.substring(0, 300),
            url: href ? (href.startsWith('http') ? href : `https://www.cortecostituzionale.it${href}`) : undefined,
          });
        }
      });
    }

    return {
      sentenze: sentenze.slice(0, input.pageSize ?? 20),
      totali: sentenze.length,
      urlRicerca: ricerca,
      urlConsultazione: consultazione,
      note: sentenze.length > 0
        ? 'Risultati estratti euristici. Verificare sul sito ufficiale.'
        : 'Nessun risultato euristico. Il sito potrebbe essere protetto da anti-bot. Usare gli URL forniti.',
    } as {
      sentenze: Array<{ numero?: string; anno?: number; data?: string; oggetto?: string; url?: string }>;
      totali: number;
      urlRicerca: string;
      urlConsultazione: string;
      note: string;
    };
  } catch (error) {
    const parsed = parseApiError(error);
    return {
      sentenze: [],
      totali: 0,
      urlRicerca: ricerca,
      urlConsultazione: consultazione,
      note: `Accesso al sito limitato (${parsed.code}: ${parsed.message}). Il portale della Corte Costituzionale utilizza protezione anti-bot. Si consiglia di consultare direttamente gli URL forniti.`,
    } as unknown as {
      sentenze: Array<{ numero?: string; anno?: number; data?: string; oggetto?: string; url?: string }>;
      totali: number;
      urlRicerca: string;
      urlConsultazione: string;
      note: string;
    };
  }
}
