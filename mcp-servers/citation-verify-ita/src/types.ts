import { z } from 'zod';

export const CheckExistenceInputSchema = z.object({
  citazione: z.string().min(1).describe('Citazione giuridica da verificare (es. "Cass. n. 12345/2024", "D.Lgs. 231/2001", "art. 1456 c.c.")'),
  italgiure_cookie: z.string().optional().describe('Cookie di sessione ItalGiure per citazioni di giurisprudenza (opzionale; se omesso, usa ITALGIURE_COOKIE env var o italgiure_cookie.txt)'),
});

export type CheckExistenceInput = z.infer<typeof CheckExistenceInputSchema>;

/**
 * Risultato della normalizzazione di una citazione.
 */
export interface CitazioneNormalizzata {
  /** Tipo di fonte riconosciuta */
  kind: 'sentenza_cassazione' | 'atto_normativo' | 'non_riconosciuta';
  /** Per sentenze Cassazione */
  numero?: string;
  anno?: number;
  sezione?: string;
  /** Per atti normativi */
  denominazioneAtto?: string;   // es. "DECRETO LEGISLATIVO"
  numeroAtto?: string;
  annoAtto?: number;
  articolo?: string;
  /** Codice esteso (es. "Codice civile") se la citazione era abbreviata (c.c., c.p.c., ...) */
  codiceEsteso?: string;
}

export interface CheckExistenceResult {
  exists: boolean;
  fonte: 'cassazione' | 'normattiva' | null;
  riferimento_normalizzato: {
    tipo?: string;
    numero?: string;
    anno?: number;
    sezione?: string;
    articolo?: string;
    codiceRedazionale?: string;
    dataGU?: string;
    url?: string;
  } | null;
  note: string[];
}
