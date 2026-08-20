#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ComputeDeadlinesInputSchema, DraftDocumentInputSchema } from './types.js';
import { computeDeadlines } from './tools/compute-deadlines.js';
import { draftDocument } from './tools/draft-document.js';

const tools: Tool[] = [
  {
    name: 'legal-persona-ita_draft_document',
    description: `Redige una bozza di documento giuridico italiano.

Tipi supportati:
- contratto
- ricorso
- parere
- lettera_formale
- memoria_difensiva
- atto_di_citazione

Parametri:
- tipo (obbligatorio): tipo documento
- parti: nomi delle parti
- oggetto (obbligatorio): oggetto
- puntiChiave: punti da trattare
- datiAggiuntivi: mappa chiave-valore`,
    inputSchema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['contratto', 'ricorso', 'parere', 'lettera_formale', 'memoria_difensiva', 'atto_di_citazione'] },
        parti: { type: 'array', items: { type: 'string' } },
        oggetto: { type: 'string' },
        puntiChiave: { type: 'array', items: { type: 'string' } },
        datiAggiuntivi: { type: 'object' },
      },
      required: ['tipo', 'oggetto'],
    },
  },
  {
    name: 'legal-persona-ita_compute_deadlines',
    description: `Computa i termini processuali italiani in modo deterministico (nessun LLM).

Tipi di termine supportati:
- cpc_impugnazione_sentenza_30: 30 gg appello ordinario/opposizione (art. 325 c.p.c.)
- cpc_impugnazione_sentenza_60: 60 gg appello ex art. 327 c.p.c.
- cpc_ricorso_cassazione_60: 60 gg ricorso cassazione (art. 369 c.p.c.)
- cpc_revocazione_30: 30 gg revocazione ordinaria (art. 395 c.p.c.)
- cpc_reclamo_10: 10 gg reclamo (artt. 669-terdecies, 739 c.p.c.) — termine a giorni liberi
- cpc_comparsa_risposta_70: 70 gg comparsa di risposta (art. 167 c.p.c.)
- cpc_deposito_183_30_60_80: fascicolo di parte, scadenze 30/60/80 gg (art. 183, comma 6, c.p.c.)
- cpc_memoria_183_15: 15 gg memoria replica/chiarimenti (art. 183, comma 6, c.p.c.)
- cpp_appello_15_30_45: appello penale, 15/30/45 gg (art. 585 c.p.p.) — giorni liberi
- cpp_cassazione_15_30_45: ricorso cassazione penale, 15/30/45 gg (art. 585 c.p.p.) — giorni liberi
- cpa_ricorso_30_60: ricorso TAR 60 gg / CdS 30 gg (art. 29 e art. 41 c.p.a.)

Regole applicate: art. 155 c.p.c. (giorno iniziale non computato, proroga per
sabato/domenica/festivi salvo termini a giorni liberi), festività nazionali
incluse Pasqua e Pasquetta (algoritmo di Gauss), sospensione feriale
1°-31 agosto (L. 742/1969) solo per i termini civili cpc_*.

Parametri:
- tipo_termine (obbligatorio): uno dei tipi sopra elencati
- data_inizio (obbligatorio): data di decorrenza in formato YYYY-MM-DD
- regione: riservato (sono considerate solo festività nazionali)
- lingua: 'it' (default) o 'en' per disclaimer e note`,
    inputSchema: {
      type: 'object',
      properties: {
        tipo_termine: {
          type: 'string',
          enum: [
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
          ],
        },
        data_inizio: { type: 'string', pattern: '^\\\\d{4}-\\\\d{2}-\\\\d{2}$' },
        regione: { type: 'string' },
        lingua: { type: 'string', enum: ['it', 'en'] },
      },
      required: ['tipo_termine', 'data_inizio'],
    },
  },
];

export function createLegalPersonaItaServer(): Server {
  const server = new Server(
    { name: 'legal-persona-ita', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      switch (name) {
        case 'legal-persona-ita_draft_document': {
          const input = DraftDocumentInputSchema.parse(args);
          const result = await draftDocument(input);
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, data: result }, null, 2) }] };
        }
        case 'legal-persona-ita_compute_deadlines': {
          const input = ComputeDeadlinesInputSchema.parse(args);
          const result = await computeDeadlines(input);
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, data: result }, null, 2) }] };
        }
        default:
          throw new Error(`Tool sconosciuto: ${name}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: message }, null, 2) }], isError: true };
    }
  });

  return server;
}

async function main(): Promise<void> {
  const server = createLegalPersonaItaServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Legal Persona ITA MCP server running on stdio');
  process.on('SIGINT', async () => { await server.close(); process.exit(0); });
  process.on('SIGTERM', async () => { await server.close(); process.exit(0); });
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
