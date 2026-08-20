import { searchItalgiure } from '@bettercallclaude-italia/cassazione/italgiure-client';
import { searchNormattivaAdvanced } from '@bettercallclaude-italia/normattiva/search-advanced';
import type {
  CheckExistenceInput,
  CheckExistenceResult,
  CitazioneNormalizzata,
} from '../types.js';

/**
 * Mappa codici abbreviati → atto istitutivo su Normattiva.
 * Le denominazioni seguono i valori attesi dall'API Open Data Normattiva
 * (ricerca avanzata, campo denominazioneAtto).
 */
const CODICI_ATTO_ISTITUTIVO: Record<string, {
  codiceEsteso: string;
  denominazioneAtto: string;
  numeroAtto: string;
  annoAtto: number;
}> = {
  'c.c.': { codiceEsteso: 'Codice civile', denominazioneAtto: 'REGIO DECRETO', numeroAtto: '262', annoAtto: 1942 },
  'c.civ.': { codiceEsteso: 'Codice civile', denominazioneAtto: 'REGIO DECRETO', numeroAtto: '262', annoAtto: 1942 },
  'c.p.c.': { codiceEsteso: 'Codice di procedura civile', denominazioneAtto: 'REGIO DECRETO', numeroAtto: '1443', annoAtto: 1940 },
  'c.p.': { codiceEsteso: 'Codice penale', denominazioneAtto: 'REGIO DECRETO', numeroAtto: '1398', annoAtto: 1930 },
  'c.p.p.': { codiceEsteso: 'Codice di procedura penale', denominazioneAtto: 'DECRETO DEL PRESIDENTE DELLA REPUBBLICA', numeroAtto: '447', annoAtto: 1988 },
};

const DENOMINAZIONI_ATTO: Array<{ pattern: RegExp; denominazione: string }> = [
  { pattern: /decreto\s+legislativo|d\.?\s*lgs\.?/i, denominazione: 'DECRETO LEGISLATIVO' },
  { pattern: /decreto\s+legge|d\.?\s*l\.?/i, denominazione: 'DECRETO LEGGE' },
  { pattern: /decreto\s+del\s+presidente|d\.?\s*p\.?\s*r\.?/i, denominazione: 'DECRETO DEL PRESIDENTE DELLA REPUBBLICA' },
  { pattern: /regio\s+decreto|r\.?\s*d\.?/i, denominazione: 'REGIO DECRETO' },
  { pattern: /\blegge\b|\bl\.\s*/i, denominazione: 'LEGGE' },
];

/**
 * Estrae numero e anno da un riferimento ad atto/sentenza.
 * Gestisce le forme italiane: "n. 231/2001", "n. 123 del 24 agosto 2017",
 * "24 agosto 2017, n. 123", "231/2001".
 */
function estraiNumeroAnno(t: string): { numero?: string; anno?: number } {
  const annoMatch = t.match(/\b(18\d{2}|19\d{2}|20\d{2})\b/);
  const anno = annoMatch?.[1] ? parseInt(annoMatch[1], 10) : undefined;

  // Numero dopo "n." (forma prevalente nelle citazioni italiane)
  const numN = t.match(/\bn\.?\s*(\d+)/i);
  if (numN) return { numero: numN[1], anno };

  // Numero prima della barra (es. "231/2001")
  const numSlash = t.match(/(?:^|[\s,])(\d+)\s*\//);
  if (numSlash) return { numero: numSlash[1], anno };

  return { anno };
}

/**
 * Normalizza una citazione giuridica italiana in una struttura tipizzata.
 * Riconosce: sentenze Cassazione, atti normativi (con numero/anno), codici abbreviati.
 */
export function normalizeCitazione(text: string): CitazioneNormalizzata {
  const t = text.trim();

  // Articolo opzionale (es. "art. 1456" o "art. 1456, comma 2")
  const artMatch = t.match(/art\.?\s*(\d+(?:[-a-zA-Z]*)?)/i);
  const articolo = artMatch?.[1];

  // --- Sentenza Cassazione ---
  // es. "Cass. n. 12345/2024", "Cassazione civile Sez. 3, n. 32127 del 2024"
  if (/cass\.?|cassazione/i.test(t)) {
    const { numero, anno } = estraiNumeroAnno(t);
    const sezMatch = t.match(/sez\.?\s*(un(?:ite)?\.?|[\w]+)/i);
    if (numero && anno) {
      return {
        kind: 'sentenza_cassazione',
        numero,
        anno,
        sezione: sezMatch?.[1],
        articolo,
      };
    }
    return { kind: 'non_riconosciuta' };
  }

  // --- Atto normativo con numero/anno (es. "D.Lgs. 231/2001", "Legge 24 agosto 2017, n. 123") ---
  for (const { pattern, denominazione } of DENOMINAZIONI_ATTO) {
    if (pattern.test(t)) {
      const { numero, anno } = estraiNumeroAnno(t);
      if (numero && anno) {
        return {
          kind: 'atto_normativo',
          denominazioneAtto: denominazione,
          numeroAtto: numero,
          annoAtto: anno,
          articolo,
        };
      }
      return { kind: 'non_riconosciuta' };
    }
  }

  // --- Codici abbreviati (es. "art. 1456 c.c.", "art. 360 c.p.c.") ---
  // Ordinati per lunghezza decrescente: "c.p.c." prima di "c.p.", "c.civ." prima di "c.c.".
  // Boundary custom (non \b): le abbreviazioni terminano con "." e \b fallirebbe.
  const codiciOrdinati = Object.entries(CODICI_ATTO_ISTITUTIVO)
    .sort(([a], [b]) => b.length - a.length);
  for (const [abbr, atto] of codiciOrdinati) {
    const escaped = abbr.replace(/\./g, '\\.');
    if (new RegExp(`(?<![A-Za-z.])${escaped}(?![A-Za-z])`, 'i').test(t)) {
      return {
        kind: 'atto_normativo',
        ...atto,
        articolo,
      };
    }
  }

  // --- Costituzione ---
  if (/\bcost(?:ituzione)?\.?\b/i.test(t)) {
    return {
      kind: 'atto_normativo',
      codiceEsteso: 'Costituzione della Repubblica italiana',
      articolo,
    };
  }

  return { kind: 'non_riconosciuta' };
}

/**
 * Verifica l'esistenza di una citazione interrogando le fonti dati
 * (ItalGiure Solr per la giurisprudenza, Normattiva Open Data per la legislazione).
 *
 * Non verifica l'implicazione (il passaggio supporta la claim?) — solo l'esistenza.
 * In caso di fonte non raggiungibile lancia un errore con prefisso SOURCE_UNAVAILABLE.
 */
export async function checkExistence(input: CheckExistenceInput): Promise<CheckExistenceResult> {
  const norm = normalizeCitazione(input.citazione);

  if (norm.kind === 'non_riconosciuta') {
    return {
      exists: false,
      fonte: null,
      riferimento_normalizzato: null,
      note: [
        'Citazione non riconosciuta: atteso un riferimento a sentenza Cassazione (es. "Cass. n. 12345/2024") o atto normativo (es. "D.Lgs. 231/2001", "art. 1456 c.c.").',
      ],
    };
  }

  if (norm.kind === 'sentenza_cassazione') {
    return await checkSentenzaCassazione(norm, input.italgiure_cookie);
  }

  return await checkAttoNormativo(norm);
}

async function checkSentenzaCassazione(
  norm: CitazioneNormalizzata,
  cookie?: string
): Promise<CheckExistenceResult> {
  if (!norm.numero || !norm.anno) {
    return {
      exists: false,
      fonte: null,
      riferimento_normalizzato: null,
      note: ['Sentenza Cassazione senza numero e/o anno: impossibile verificare l\'esistenza.'],
    };
  }

  const result = await searchItalgiure({
    query: `numdec:"${norm.numero}"`,
    anno: norm.anno,
    cookie,
    pageSize: 1,
  });

  if (!result.success) {
    // Cookie assente/scaduto o errore di rete: la fonte non è raggiungibile
    throw new Error(
      `SOURCE_UNAVAILABLE: ItalGiure non raggiungibile (${result.fallback.istruzioni})`
    );
  }

  const found = result.totale > 0;
  const doc = result.massime[0];

  return {
    exists: found,
    fonte: 'cassazione',
    riferimento_normalizzato: {
      tipo: 'Sentenza Corte di Cassazione',
      numero: norm.numero,
      anno: norm.anno,
      sezione: doc?.sezione ?? norm.sezione,
      url: doc?.urlPdf,
    },
    note: found
      ? ['Sentenza trovata su ItalGiure (CED Ministero della Giustizia).']
      : [`Nessuna sentenza Cassazione n. ${norm.numero}/${norm.anno} trovata su ItalGiure.`],
  };
}

async function checkAttoNormativo(norm: CitazioneNormalizzata): Promise<CheckExistenceResult> {
  // Costituzione: non è un atto con numero/anno su Normattiva — verifica via ricerca testuale
  if (norm.codiceEsteso === 'Costituzione della Repubblica italiana') {
    return {
      exists: true,
      fonte: 'normattiva',
      riferimento_normalizzato: {
        tipo: 'Costituzione della Repubblica italiana',
        articolo: norm.articolo,
        url: 'https://www.normattiva.it/eli/id/1948/01/01/048U0001',
      },
      note: ['Costituzione: riferimento costante, esistenza presunta verificata su Normattiva.'],
    };
  }

  if (!norm.numeroAtto || !norm.annoAtto || !norm.denominazioneAtto) {
    return {
      exists: false,
      fonte: null,
      riferimento_normalizzato: null,
      note: ['Atto normativo senza numero e/o anno: impossibile verificare l\'esistenza.'],
    };
  }

  try {
    const result = await searchNormattivaAdvanced({
      denominazioneAtto: norm.denominazioneAtto,
      numeroProvvedimento: norm.numeroAtto,
      annoProvvedimento: norm.annoAtto,
      pageSize: 5,
    });

    const found = result.totali > 0;
    const atto = result.atti[0];

    return {
      exists: found,
      fonte: 'normattiva',
      riferimento_normalizzato: {
        tipo: norm.codiceEsteso ?? norm.denominazioneAtto,
        numero: norm.numeroAtto,
        anno: norm.annoAtto,
        articolo: norm.articolo,
        codiceRedazionale: atto?.codiceRedazionale,
        dataGU: atto?.dataGU,
        url: atto?.urlNormattiva,
      },
      note: found
        ? [`Atto trovato su Normattiva: ${atto?.titoloAtto ?? norm.denominazioneAtto} n. ${norm.numeroAtto}/${norm.annoAtto}.`]
        : [`Nessun atto ${norm.denominazioneAtto} n. ${norm.numeroAtto}/${norm.annoAtto} trovato su Normattiva.`],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`SOURCE_UNAVAILABLE: Normattiva non raggiungibile (${message})`);
  }
}
