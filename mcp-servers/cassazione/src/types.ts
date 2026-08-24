import { z } from 'zod';

export const SearchMassimeInputSchema = z.object({
  query: z.string().min(1).describe('Parole chiave di ricerca (testo libero o sintassi Solr)'),
  materia: z.enum(['civile', 'penale', '']).optional().describe("Filtra per materia: 'civile', 'penale', o omesso per entrambe"),
  anno: z.number().int().min(0).optional().describe('Anno della sentenza (0 o omesso = tutti gli anni)'),
  tipo: z.enum(['sentenza', 'ordinanza', 'decreto', '']).optional().describe("Tipo di provvedimento: 'sentenza', 'ordinanza', 'decreto', o omesso per tutti"),
  page: z.number().int().min(1).optional().describe('Numero pagina (default 1)'),
  pageSize: z.number().int().min(1).max(50).optional().describe('Risultati per pagina, max 50 (default 20)'),
  cookie: z.string().optional().describe('Cookie di sessione ItalGiure. Se omesso, usa session_key (vault), ITALGIURE_COOKIE env var o italgiure_cookie.txt'),
  session_key: z.string().optional().describe('Chiave di una sessione registrata via cassazione_session_set: il cookie viene letto dal vault lato server'),
});

export type SearchMassimeInput = z.infer<typeof SearchMassimeInputSchema>;

export const GetSentenzaInputSchema = z.object({
  id: z.string().min(1).describe('Identificativo sentenza (es. snciv2024332127S)'),
  cookie: z.string().optional().describe('Cookie di sessione ItalGiure. Se omesso, usa session_key (vault), ITALGIURE_COOKIE env var o italgiure_cookie.txt'),
  session_key: z.string().optional().describe('Chiave di una sessione registrata via cassazione_session_set: il cookie viene letto dal vault lato server'),
});

export type GetSentenzaInput = z.infer<typeof GetSentenzaInputSchema>;

export const SessionSetInputSchema = z.object({
  session_key: z.string().min(8).describe('Passphrase scelta dall\'utente (min 8 caratteri): identifica la sessione; non viene mai salvata in chiaro'),
  cookie: z.string().min(1).describe('Cookie di sessione ItalGiure da registrare (cifrato AES-256-GCM a riposo)'),
});

export type SessionSetInput = z.infer<typeof SessionSetInputSchema>;

export const SessionKeyInputSchema = z.object({
  session_key: z.string().min(8).describe('Passphrase della sessione registrata'),
});

export type SessionKeyInput = z.infer<typeof SessionKeyInputSchema>;
