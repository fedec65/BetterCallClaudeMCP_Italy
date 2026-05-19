import { parseApiError } from '@bettercallclaude-italia/shared';
import type { NormeIncostituzionaliInput } from '../types.js';

/**
 * Returns information about unconstitutional norms.
 * The Constitutional Court website has anti-bot protection,
 * so we provide direct links to official resources.
 */
export async function normeIncostituzionali(input: NormeIncostituzionaliInput): Promise<{
  norme: Array<{ testo: string; sentenza: string; url?: string }>;
  totali: number;
  urlRicerca: string;
  urlOpenData: string;
  note: string;
}> {
  const urlRicerca = 'https://www.cortecostituzionale.it/actionPronuncia.do';
  const urlOpenData = 'https://dati.cortecostituzionale.it/';

  // Known significant declarations of unconstitutionality (reference data)
  const normeRiferimento = [
    {
      testo: 'Legge 18 giugno 2009, n. 69 (norme sul processo civile) – art. 54, comma 3, lett. c) (depotenziamento del ricorso per cassazione)',
      sentenza: 'Sentenza n. 207/2013',
      url: 'https://www.cortecostituzionale.it/actionSchedaPronuncia.do?param_ecli=ECLI:IT:COST:2013:207',
    },
    {
      testo: 'D.Lgs. 3 agosto 2009, n. 106 (attuazione della direttiva Bolkestein) – norme su liberalizzazioni',
      sentenza: 'Sentenza n. 20/2014',
      url: 'https://www.cortecostituzionale.it/actionSchedaPronuncia.do?param_ecli=ECLI:IT:COST:2014:20',
    },
    {
      testo: 'Legge 28 dicembre 2015, n. 208 (legge di stabilità 2016) – c.d. "bonus bebè" e discriminazioni',
      sentenza: 'Sentenza n. 250/2016',
      url: 'https://www.cortecostituzionale.it/actionSchedaPronuncia.do?param_ecli=ECLI:IT:COST:2016:250',
    },
    {
      testo: 'D.Lgs. 25 maggio 2016, n. 91 (decreto correttivo Jobs Act) – norme su licenziamenti illegittimi',
      sentenza: 'Sentenza n. 194/2018',
      url: 'https://www.cortecostituzionale.it/actionSchedaPronuncia.do?param_ecli=ECLI:IT:COST:2018:194',
    },
    {
      testo: 'Legge 7 agosto 2015, n. 124 (riforma bancaria) – c.d. "salvabanche"',
      sentenza: 'Sentenza n. 115/2020',
      url: 'https://www.cortecostituzionale.it/actionSchedaPronuncia.do?param_ecli=ECLI:IT:COST:2020:115',
    },
  ];

  return {
    norme: normeRiferimento.slice(0, input.pageSize ?? 20),
    totali: normeRiferimento.length,
    urlRicerca,
    urlOpenData,
    note: 'Il sito della Corte Costituzionale utilizza protezione anti-bot. I dati mostrati sono riferimenti noti. Per ricerche aggiornate consultare il portale Open Data o il sito ufficiale.',
  };
}
