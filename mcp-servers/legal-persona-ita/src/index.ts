#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { DraftDocumentInputSchema } from './types.js';
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
