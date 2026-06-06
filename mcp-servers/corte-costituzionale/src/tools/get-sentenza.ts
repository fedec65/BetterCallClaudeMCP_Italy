import { parseApiError } from '@bettercallclaude-italia/shared';
import type { GetSentenzaInput } from '../types.js';
import { getPronuncia } from './opendata-cache.js';

const SITE_BASE = 'https://www.cortecostituzionale.it';
const OPEN_DATA_URL = 'https://dati.cortecostituzionale.it';

export async function getSentenza(input: GetSentenzaInput): Promise<{
  numero: string;
  anno: number;
  url?: string;
  urlConsultazione?: string;
  testo?: string;
  note: string;
}> {
  const ecli = `ECLI:IT:COST:${input.anno}:${input.numero}`;
  const url = `${SITE_BASE}/actionSchedaPronuncia.do?param_ecli=${ecli}`;
  const urlConsultazione = `${SITE_BASE}/actionPronuncia.do?numero=${input.numero}&anno=${input.anno}`;

  try {
    const pronuncia = await getPronuncia(input.anno, input.numero);

    if (pronuncia?.testo) {
      // Clean HTML entities and trim
      const testo = pronuncia.testo
        .replace(/&#13;/g, '')
        .replace(/\r\n/g, '\n')
        .substring(0, 8000);

      return {
        numero: input.numero,
        anno: input.anno,
        url,
        urlConsultazione,
        testo,
        note: `Testo integrale da Open Data Corte Costituzionale (${OPEN_DATA_URL}, CC BY-SA 3.0).`,
      };
    }

    if (pronuncia?.epigrafe) {
      return {
        numero: input.numero,
        anno: input.anno,
        url,
        urlConsultazione,
        testo: pronuncia.epigrafe.replace(/&#13;/g, '').replace(/\r\n/g, ' '),
        note: `Testo integrale non presente nel dataset. Epigrafe disponibile. Consultare: ${url}`,
      };
    }

    // Pronouncement not found in dataset
    return {
      numero: input.numero,
      anno: input.anno,
      url,
      urlConsultazione,
      testo: '',
      note: `Pronuncia ${input.numero}/${input.anno} non trovata nel dataset Open Data. Consultare: ${url}`,
    };
  } catch (error) {
    const parsed = parseApiError(error);
    return {
      numero: input.numero,
      anno: input.anno,
      url,
      urlConsultazione,
      testo: '',
      note: `Errore Open Data (${parsed.code}): ${parsed.message}. Consultare: ${url}`,
    };
  }
}
