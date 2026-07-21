import { z } from 'zod';

export const SearchMassimeInputSchema = z.object({
  query: z.string().min(1).describe('Parole chiave di ricerca (testo libero o sintassi Solr)'),
  materia: z.enum(['civile', 'penale', '']).optional().describe("Filtra per materia: 'civile', 'penale', o omesso per entrambe"),
  anno: z.number().int().min(0).optional().describe('Anno della sentenza (0 o omesso = tutti gli anni)'),
  tipo: z.enum(['sentenza', 'ordinanza', 'decreto', '']).optional().describe("Tipo di provvedimento: 'sentenza', 'ordinanza', 'decreto', o omesso per tutti"),
  page: z.number().int().min(1).optional().describe('Numero pagina (default 1)'),
  pageSize: z.number().int().min(1).max(50).optional().describe('Risultati per pagina, max 50 (default 20)'),
  cookie: z.string().optional().describe('Cookie di sessione ItalGiure. Se omesso, usa ITALGIURE_COOKIE env var o italgiure_cookie.txt'),
});

export type SearchMassimeInput = z.infer<typeof SearchMassimeInputSchema>;

export const GetSentenzaInputSchema = z.object({
  id: z.string().min(1).describe('Identificativo sentenza (es. snciv2024332127S)'),
  cookie: z.string().optional().describe('Cookie di sessione ItalGiure. Se omesso, usa ITALGIURE_COOKIE env var o italgiure_cookie.txt'),
});

export type GetSentenzaInput = z.infer<typeof GetSentenzaInputSchema>;
