import { z } from 'zod';

export const DraftDocumentInputSchema = z.object({
  tipo: z.enum([
    'contratto',
    'ricorso',
    'parere',
    'lettera_formale',
    'memoria_difensiva',
    'atto_di_citazione',
  ]).describe('Tipo di documento da redigere'),
  parti: z.array(z.string()).optional().describe('Nomi delle parti coinvolte'),
  oggetto: z.string().min(1).describe('Oggetto del documento'),
  puntiChiave: z.array(z.string()).optional().describe('Punti chiave da trattare'),
  datiAggiuntivi: z.record(z.string()).optional().describe('Dati aggiuntivi (es. importo, termini)'),
});

export type DraftDocumentInput = z.infer<typeof DraftDocumentInputSchema>;

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_REGEX.test(value)) return false;
  const parts = value.split('-').map(Number);
  const [y, m, d] = parts as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

export const ComputeDeadlinesInputSchema = z.object({
  tipo_termine: z.enum([
    'cpc_impugnazione_sentenza_30',
    'cpc_impugnazione_sentenza_60',
    'cpc_ricorso_cassazione_60',
    'cpc_revocazione_30',
    'cpc_reclamo_10',
    'cpc_comparsa_risposta_70',
    'cpc_deposito_183_30_60_80',
    'cpc_memoria_183_15',
    'cpp_appello_15_30_45',
    'cpp_cassazione_15_30_45',
    'cpa_ricorso_30_60',
  ]).describe('Tipo di termine processuale da computare'),
  data_inizio: z
    .string()
    .regex(ISO_DATE_REGEX, 'Formato data non valido: atteso YYYY-MM-DD')
    .refine(isValidIsoDate, 'Data inesistente (es. 30 febbraio): verificare il valore in formato YYYY-MM-DD')
    .describe('Data di decorrenza del termine (dies a quo), formato ISO YYYY-MM-DD'),
  regione: z
    .string()
    .optional()
    .describe('Riservato per uso futuro: attualmente sono considerate solo le festività nazionali'),
  lingua: z
    .enum(['it', 'en'])
    .optional()
    .default('it')
    .describe('Lingua di disclaimer e note (default: it)'),
});

export type ComputeDeadlinesInput = z.infer<typeof ComputeDeadlinesInputSchema>;

export interface Scadenza {
  giorni: number;
  data: string;
}

export interface ComputeDeadlinesOutput {
  tipo_termine: string;
  data_inizio: string;
  data_scadenza: string;
  giorni_effettivi: number;
  sospensione_feriale_applicata: boolean;
  festivita_incontrate: string[];
  aggiustamento_weekend: boolean;
  note: string[];
  disclaimer: string;
  scadenze?: Scadenza[];
}
