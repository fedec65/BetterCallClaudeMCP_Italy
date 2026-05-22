#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { SearchMassimeInputSchema, GetSentenzaInputSchema } from './types.js';
import { searchMassime } from './tools/search-massime.js';
import { getSentenzaCassazione } from './tools/get-sentenza.js';

const tools: Tool[] = [
  {
    name: 'cassazione_search_massime',
    description: `Ricerca massime della Corte di Cassazione (porzione pubblica).

⚠️ LIMITAZIONE: il portale della Corte di Cassazione (cortedicassazione.it) blocca sistematicamente l'accesso con HTTP 403. Lo scraping non è possibile. Il tool restituisce URL di ricerca alternativi (ItalGiure per operatori del diritto) e suggerimenti per la consultazione manuale.

Parametri:
- query (obbligatorio): parole chiave
- page / pageSize: paginazione`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        page: { type: 'number', minimum: 1 },
        pageSize: { type: 'number', minimum: 1, maximum: 50 },
      },
      required: ['query'],
    },
  },
  {
    name: 'cassazione_get_sentenza',
    description: `Recupera sentenza Cassazione (porzione pubblica).

Parametri:
- id (obbligatorio): identificativo`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
];

export function createCassazioneServer(): Server {
  const server = new Server(
    { name: 'cassazione', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      switch (name) {
        case 'cassazione_search_massime': {
          const input = SearchMassimeInputSchema.parse(args);
          const result = await searchMassime(input);
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, data: result }, null, 2) }] };
        }
        case 'cassazione_get_sentenza': {
          const input = GetSentenzaInputSchema.parse(args);
          const result = await getSentenzaCassazione(input);
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
  const server = createCassazioneServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Cassazione MCP server running on stdio');
  process.on('SIGINT', async () => { await server.close(); process.exit(0); });
  process.on('SIGTERM', async () => { await server.close(); process.exit(0); });
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
