import type {
  ComputeDeadlinesInput,
  ComputeDeadlinesOutput,
  Scadenza,
} from '../types.js';

/**
 * Computazione dei termini processuali italiani.
 *
 * Regole implementate:
 * - art. 155, comma 1, c.p.c.: il giorno iniziale non si computa
 *   (scadenza = data_inizio + giorni);
 * - art. 155, comma 4, c.p.c.: se il giorno di scadenza è sabato, domenica o
 *   festività nazionale, il termine si intende prorogato di diritto al primo
 *   giorno seguente non festivo;
 * - art. 155, comma 5, c.p.c.: la proroga NON opera per i termini a giorni
 *   liberi (flag `giorniLiberi` nella tabella);
 * - sospensione feriale (L. 742/1969, come modificata dalla L. 80/2005):
 *   dal 1° al 31 agosto i termini processuali civili (tipi `cpc_*`) sono
 *   sospesi. Convenzione adottata: i giorni di agosto non si computano nel
 *   termine. Se la decorrenza inizia ad agosto, il dies a quo effettivo è il
 *   1° settembre (i giorni di agosto non si contano). Se la scadenza cade in
 *   agosto, slitta in avanti dei giorni feriali intercorsi (es. scadenza
 *   10 agosto → 10 settembre). La sospensione NON si applica ai termini
 *   penali (`cpp_*`, giurisdizione con regole proprie: la sospensione feriale
 *   penale è stata abrogata) né a quelli amministrativi (`cpa_*`, il rito
 *   amministrativo non conosce sospensione feriale).
 *
 * Scelte interpretative sui termini a giorni liberi:
 * - `cpc_reclamo_10`: la giurisprudenza prevalente qualifica il termine
 *   decadenza di 10 giorni per il reclamo (art. 669-terdecies c.p.c.) come
 *   termine a giorni liberi → nessuna proroga ex art. 155, comma 4;
 * - `cpp_appello_15_30_45` e `cpp_cassazione_15_30_45`: nel rito penale i
 *   termini si computano a giorni liberi (art. 175 c.p.p.).
 */

interface TipoTermineDef {
  giorni: number[];
  riferimento: string;
  descrizione: string;
  giorniLiberi: boolean;
  sospensioneFeriale: boolean;
  notaSoglie?: { it: string; en: string };
}

const TIPI_TERMINE: Record<ComputeDeadlinesInput['tipo_termine'], TipoTermineDef> = {
  cpc_impugnazione_sentenza_30: {
    giorni: [30],
    riferimento: 'art. 325 c.p.c.',
    descrizione: 'Termine breve di impugnazione (appello/opposizione), 30 giorni',
    giorniLiberi: false,
    sospensioneFeriale: true,
  },
  cpc_impugnazione_sentenza_60: {
    giorni: [60],
    riferimento: 'art. 327 c.p.c.',
    descrizione: 'Termine lungo di impugnazione per appello, 60 giorni',
    giorniLiberi: false,
    sospensioneFeriale: true,
  },
  cpc_ricorso_cassazione_60: {
    giorni: [60],
    riferimento: 'art. 369 c.p.c.',
    descrizione: 'Ricorso per cassazione, 60 giorni',
    giorniLiberi: false,
    sospensioneFeriale: true,
  },
  cpc_revocazione_30: {
    giorni: [30],
    riferimento: 'art. 395 c.p.c.',
    descrizione: 'Revocazione ordinaria, 30 giorni',
    giorniLiberi: false,
    sospensioneFeriale: true,
  },
  cpc_reclamo_10: {
    giorni: [10],
    riferimento: 'artt. 669-terdecies, 739 c.p.c.',
    descrizione: 'Reclamo, 10 giorni',
    // Giurisprudenza prevalente: termine a giorni liberi → nessuna proroga
    // ex art. 155, comma 4, c.p.c. per scadenza in giorno festivo.
    giorniLiberi: true,
    sospensioneFeriale: true,
  },
  cpc_comparsa_risposta_70: {
    giorni: [70],
    riferimento: 'art. 167 c.p.c.',
    descrizione: 'Comparsa di risposta, 70 giorni prima dell’udienza',
    giorniLiberi: false,
    sospensioneFeriale: true,
  },
  cpc_deposito_183_30_60_80: {
    giorni: [30, 60, 80],
    riferimento: 'art. 183, comma 6, c.p.c.',
    descrizione: 'Fascicolo di parte: memorie 30 gg, memorie di replica 60 gg, deposito 80 gg',
    giorniLiberi: false,
    sospensioneFeriale: true,
    notaSoglie: {
      it: 'Soglie art. 183, comma 6, c.p.c.: 30 gg (memoria), 60 gg (memoria di replica), 80 gg (deposito documenti e note). La scadenza principale riportata è quella a 80 giorni.',
      en: 'Art. 183(6) c.p.c. thresholds: 30 days (brief), 60 days (reply brief), 80 days (filing of documents and notes). The main deadline reported is the 80-day one.',
    },
  },
  cpc_memoria_183_15: {
    giorni: [15],
    riferimento: 'art. 183, comma 6, c.p.c.',
    descrizione: 'Memoria di replica/chiarimenti, 15 giorni',
    giorniLiberi: false,
    sospensioneFeriale: true,
  },
  cpp_appello_15_30_45: {
    giorni: [15, 30, 45],
    riferimento: 'art. 585 c.p.p.',
    descrizione: 'Appello penale: 15/30/45 giorni a seconda dell’ipotesi',
    // Nel rito penale i termini si computano a giorni liberi (art. 175 c.p.p.).
    giorniLiberi: true,
    sospensioneFeriale: false,
    notaSoglie: {
      it: 'Soglie art. 585 c.p.p.: 15, 30 o 45 giorni a seconda dell’ipotesi (es. 45 gg per il contumace). Individuare la soglia applicabile al caso concreto. La scadenza principale riportata è quella a 45 giorni.',
      en: 'Art. 585 c.p.p. thresholds: 15, 30 or 45 days depending on the case (e.g. 45 days for defendants tried in absentia). Identify the applicable threshold. The main deadline reported is the 45-day one.',
    },
  },
  cpp_cassazione_15_30_45: {
    giorni: [15, 30, 45],
    riferimento: 'art. 585 c.p.p.',
    descrizione: 'Ricorso per cassazione penale: 15/30/45 giorni a seconda dell’ipotesi',
    giorniLiberi: true,
    sospensioneFeriale: false,
    notaSoglie: {
      it: 'Soglie art. 585 c.p.p.: 15, 30 o 45 giorni a seconda dell’ipotesi. Individuare la soglia applicabile al caso concreto. La scadenza principale riportata è quella a 45 giorni.',
      en: 'Art. 585 c.p.p. thresholds: 15, 30 or 45 days depending on the case. Identify the applicable threshold. The main deadline reported is the 45-day one.',
    },
  },
  cpa_ricorso_30_60: {
    giorni: [30, 60],
    riferimento: 'art. 29 c.p.a. e art. 41 c.p.a.',
    descrizione: 'Ricorso giurisdizionale amministrativo: TAR 60 gg, appello CdS 30 gg',
    giorniLiberi: false,
    sospensioneFeriale: false,
    notaSoglie: {
      it: 'Soglie: 60 gg ricorso al TAR (art. 29 c.p.a.), 30 gg appello al Consiglio di Stato (art. 41 c.p.a.). La scadenza principale riportata è quella a 60 giorni.',
      en: 'Thresholds: 60 days for the TAR application (art. 29 c.p.a.), 30 days for the appeal to the Council of State (art. 41 c.p.a.). The main deadline reported is the 60-day one.',
    },
  },
};

const MESI_IT = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

const DAY_MS = 24 * 60 * 60 * 1000;

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

function formatGiornoMese(date: Date): string {
  return `${date.getUTCDate()} ${MESI_IT[date.getUTCMonth()]}`;
}

/**
 * Algoritmo di Gauss per il calcolo della domenica di Pasqua (calendario
 * gregoriano). Restituisce una Date in UTC.
 */
export function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = aprile
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

interface Festivita {
  nome: string;
  data: Date;
}

/** Festività nazionali italiane (fisse + Pasqua e Lunedì di Pasqua mobili). */
function festivitaNazionali(year: number): Festivita[] {
  const fisse: Array<[number, number, string]> = [
    [1, 1, 'Capodanno'],
    [6, 1, 'Epifania'],
    [25, 4, 'Festa della Liberazione'],
    [1, 5, 'Festa dei Lavoratori'],
    [2, 6, 'Festa della Repubblica'],
    [15, 8, 'Ferragosto'],
    [1, 11, 'Ognissanti'],
    [8, 12, 'Immacolata Concezione'],
    [25, 12, 'Natale'],
    [26, 12, 'Santo Stefano'],
  ];
  const result: Festivita[] = fisse.map(([d, m, nome]) => ({
    nome,
    data: new Date(Date.UTC(year, m - 1, d)),
  }));
  const pasqua = easterDate(year);
  result.push({ nome: 'Pasqua', data: pasqua });
  result.push({ nome: 'Lunedì di Pasqua', data: addDays(pasqua, 1) });
  return result;
}

/** Nome della festività se la data è festiva, altrimenti null. */
function nomeFestivita(date: Date): string | null {
  const target = toIso(date);
  for (const f of festivitaNazionali(date.getUTCFullYear())) {
    if (toIso(f.data) === target) return f.nome;
  }
  return null;
}

/**
 * Conta i giorni del periodo feriale (1°–31 agosto, L. 742/1969) compresi
 * nell'intervallo (start, end] — il giorno iniziale non si conta, quello
 * finale sì.
 */
function countGiorniFeriali(start: Date, end: Date): number {
  if (end.getTime() <= start.getTime()) return 0;
  let count = 0;
  for (let y = start.getUTCFullYear(); y <= end.getUTCFullYear(); y++) {
    const jul31 = Date.UTC(y, 6, 31);
    const aug31 = Date.UTC(y, 7, 31);
    const lo = Math.max(start.getTime(), jul31);
    const hi = Math.min(end.getTime(), aug31);
    if (hi > lo) count += (hi - lo) / DAY_MS;
  }
  return count;
}

function isFerragostoTra(start: Date, end: Date): boolean {
  for (let y = start.getUTCFullYear(); y <= end.getUTCFullYear(); y++) {
    const ferragosto = Date.UTC(y, 7, 15);
    if (ferragosto > start.getTime() && ferragosto <= end.getTime()) return true;
  }
  return false;
}

function t(lingua: 'it' | 'en', it: string, en: string): string {
  return lingua === 'en' ? en : it;
}

interface EsitoSoglia {
  data: Date;
  ferialeApplicata: boolean;
}

/**
 * Computa la scadenza per una singola soglia di giorni:
 * 1. art. 155, comma 1, c.p.c.: data_inizio + giorni;
 * 2. sospensione feriale (solo tipi cpc_*): i giorni di agosto non si
 *    computano, con punto fisso iterativo (lo slittamento può a sua volta
 *    intercettare altri giorni feriali);
 * 3. proroga ex art. 155, comma 4, c.p.c. salvo termini a giorni liberi.
 */
function computaSoglia(
  def: TipoTermineDef,
  giorni: number,
  dataInizio: Date,
): EsitoSoglia {
  let diesAQuo = dataInizio;
  let ferialeApplicata = false;

  // Decorrenza in agosto: il dies a quo effettivo è il 1° settembre, ossia
  // i giorni di agosto non si contano (base di calcolo = 31 agosto).
  if (def.sospensioneFeriale && dataInizio.getUTCMonth() === 7) {
    diesAQuo = new Date(Date.UTC(dataInizio.getUTCFullYear(), 7, 31));
    ferialeApplicata = true;
  }

  let scadenza = addDays(diesAQuo, giorni);
  if (def.sospensioneFeriale) {
    let giorniFeriali = countGiorniFeriali(diesAQuo, scadenza);
    let precedente = -1;
    while (giorniFeriali !== precedente) {
      precedente = giorniFeriali;
      scadenza = addDays(diesAQuo, giorni + giorniFeriali);
      giorniFeriali = countGiorniFeriali(diesAQuo, scadenza);
    }
    if (giorniFeriali > 0) ferialeApplicata = true;
  }

  return { data: scadenza, ferialeApplicata };
}

function applicaProrogaFestivi(
  def: TipoTermineDef,
  scadenza: Date,
  festivitaIncontrate: string[],
): { data: Date; aggiustata: boolean } {
  if (def.giorniLiberi) return { data: scadenza, aggiustata: false };
  let data = scadenza;
  let aggiustata = false;
  // Guardia contro loop infiniti (mai attesa in pratica).
  for (let guard = 0; guard < 16; guard++) {
    const dow = data.getUTCDay();
    const festivo = nomeFestivita(data);
    if (dow === 0) {
      data = addDays(data, 1);
      aggiustata = true;
    } else if (dow === 6) {
      data = addDays(data, 2);
      aggiustata = true;
    } else if (festivo !== null) {
      festivitaIncontrate.push(`${festivo} (${formatGiornoMese(data)})`);
      data = addDays(data, 1);
      aggiustata = true;
    } else {
      break;
    }
  }
  return { data, aggiustata };
}

export async function computeDeadlines(
  input: ComputeDeadlinesInput,
): Promise<ComputeDeadlinesOutput> {
  const def = TIPI_TERMINE[input.tipo_termine];
  if (!def) {
    throw new Error(`Tipo termine non supportato: ${input.tipo_termine}`);
  }

  const lingua = input.lingua ?? 'it';
  const parts = input.data_inizio.split('-').map(Number);
  const [y, m, d] = parts as [number, number, number];
  const dataInizio = new Date(Date.UTC(y, m - 1, d));
  if (
    dataInizio.getUTCFullYear() !== y ||
    dataInizio.getUTCMonth() !== m - 1 ||
    dataInizio.getUTCDate() !== d
  ) {
    throw new Error(
      `Data inizio non valida: "${input.data_inizio}". Formato atteso: YYYY-MM-DD.`,
    );
  }

  const note: string[] = [];
  note.push(`${t(lingua, 'Riferimento normativo', 'Legal basis')}: ${def.riferimento}.`);

  const esiti = def.giorni.map((g) => ({ giorni: g, esito: computaSoglia(def, g, dataInizio) }));
  const principale = esiti[esiti.length - 1];
  if (!principale) {
    throw new Error(`Nessuna soglia configurata per il tipo termine: ${input.tipo_termine}`);
  }

  const festivitaIncontrate: string[] = [];
  const proroga = applicaProrogaFestivi(def, principale.esito.data, festivitaIncontrate);

  const ferialeApplicata = esiti.some((e) => e.esito.ferialeApplicata);
  if (ferialeApplicata) {
    note.push(
      t(
        lingua,
        'Sospensione feriale (L. 742/1969): i giorni dal 1° al 31 agosto non si computano nel termine; la scadenza è slittata di conseguenza.',
        'August suspension (L. 742/1969): days between 1 and 31 August are not counted; the deadline has been postponed accordingly.',
      ),
    );
    if (isFerragostoTra(dataInizio, principale.esito.data)) {
      festivitaIncontrate.push('Ferragosto (15 agosto)');
    }
  }

  if (def.giorniLiberi) {
    const dow = proroga.data.getUTCDay();
    if (dow === 0 || dow === 6 || nomeFestivita(proroga.data) !== null) {
      note.push(
        t(
          lingua,
          'Termine a giorni liberi (art. 155, comma 5, c.p.c.): la scadenza in giorno festivo NON è prorogata al primo giorno non festivo seguente.',
          'Term computed in free days (art. 155(5) c.p.c.): a deadline falling on a holiday is NOT postponed to the next business day.',
        ),
      );
    }
  }

  let scadenze: Scadenza[] | undefined;
  if (esiti.length > 1) {
    scadenze = esiti.map(({ giorni, esito }) => {
      const festivitaSoglia: string[] = [];
      const p = applicaProrogaFestivi(def, esito.data, festivitaSoglia);
      for (const f of festivitaSoglia) {
        if (!festivitaIncontrate.includes(f)) festivitaIncontrate.push(f);
      }
      return { giorni, data: toIso(p.data) };
    });
    if (def.notaSoglie) note.push(t(lingua, def.notaSoglie.it, def.notaSoglie.en));
  }

  note.push(
    t(
      lingua,
      'Sono considerate solo le festività nazionali italiane (incluse Pasqua e Lunedì di Pasqua, calcolati con l’algoritmo di Gauss).',
      'Only Italian national holidays are considered (including Easter and Easter Monday, computed with Gauss’s algorithm).',
    ),
  );

  return {
    tipo_termine: input.tipo_termine,
    data_inizio: input.data_inizio,
    data_scadenza: toIso(proroga.data),
    giorni_effettivi: diffDays(dataInizio, proroga.data),
    sospensione_feriale_applicata: ferialeApplicata,
    festivita_incontrate: festivitaIncontrate,
    aggiustamento_weekend: proroga.aggiustata,
    note,
    disclaimer: t(
      lingua,
      'Computazione ausiliaria, non consulenza legale; verificare sempre la decorrenza con il fascicolo.',
      'Auxiliary computation, not legal advice; always verify the deadline against the case file.',
    ),
    ...(scadenze ? { scadenze } : {}),
  };
}
