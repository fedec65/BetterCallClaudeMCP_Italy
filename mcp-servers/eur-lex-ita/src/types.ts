import { z } from 'zod';

export const SearchEurLexInputSchema = z.object({
  query: z.string().optional().describe('Parole chiave nel titolo'),
  tipoAtto: z.enum(['REG', 'DIR', 'DIR_IMPL', 'DEC', 'REC', 'ANY']).optional().describe('Tipo atto UE'),
  numero: z.string().optional().describe('Numero atto UE'),
  anno: z.number().int().optional().describe('Anno atto UE'),
  celex: z.string().optional().describe('Codice CELEX esatto'),
  dataInizio: z.string().optional().describe('Data inizio (YYYY-MM-DD)'),
  dataFine: z.string().optional().describe('Data fine (YYYY-MM-DD)'),
  materia: z.string().optional().describe('Materia/EuroVoc keyword'),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(50).optional(),
});

export type SearchEurLexInput = z.infer<typeof SearchEurLexInputSchema>;

export const GetAttoCelexInputSchema = z.object({
  celex: z.string().min(1).describe('Codice CELEX (es. 32016R0679)'),
});

export type GetAttoCelexInput = z.infer<typeof GetAttoCelexInputSchema>;
