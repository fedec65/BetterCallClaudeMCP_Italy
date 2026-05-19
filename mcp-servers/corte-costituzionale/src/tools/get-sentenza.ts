import { fetchWithRetry, parseApiError } from '@bettercallclaude-italia/shared';
import type { GetSentenzaInput } from '../types.js';

export async function getSentenza(input: GetSentenzaInput): Promise<{
  numero: string;
  anno: number;
  url?: string;
  urlConsultazione?: string;
  testo?: string;
  note: string;
}> {
  const url = `https://www.cortecostituzionale.it/actionSchedaPronuncia.do?param_ecli=ECLI:IT:COST:${input.anno}:${input.numero}`;
  const urlConsultazione = `https://www.cortecostituzionale.it/actionPronuncia.do?numero=${input.numero}&anno=${input.anno}`;

  try {
    const html = await fetchWithRetry(
      'cortecostituzionale',
      () =>
        fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'it-IT,it;q=0.9',
            Referer: 'https://www.cortecostituzionale.it/',
          },
        }).then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        }),
      { retries: 1 }
    );

    // Check if we got a bot protection page
    if (html.includes('cf_input') || html.includes('stormcaster') || html.includes('perfdrive')) {
      return {
        numero: input.numero,
        anno: input.anno,
        url,
        urlConsultazione,
        testo: '',
        note: `Il sito della Corte Costituzionale ha attivato la protezione anti-bot. Consultare direttamente: ${url}`,
      };
    }

    return {
      numero: input.numero,
      anno: input.anno,
      url,
      urlConsultazione,
      testo: html.substring(0, 8000),
      note: 'Testo HTML grezzo estratto. Consultare il link diretto per la formattazione corretta.',
    };
  } catch (error) {
    const parsed = parseApiError(error);
    return {
      numero: input.numero,
      anno: input.anno,
      url,
      urlConsultazione,
      testo: '',
      note: `Errore accesso: ${parsed.message}. Consultare il link diretto: ${url}`,
    };
  }
}
