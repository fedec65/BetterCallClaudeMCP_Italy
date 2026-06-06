#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  SearchSentenzeInputSchema,
  GetSentenzaInputSchema,
  NormeIncostituzionaliInputSchema,
} from './types.js';
import { searchSentenze } from './tools/search-sentenze.js';
import { getSentenza } from './tools/get-sentenza.js';
import { normeIncostituzionali } from './tools/norme-incostituzionali.js';

const tools: Tool[] = [
  {
    name: 'corte-costituzionale_search',
    description: `Ricerca sentenze della Corte Costituzionale italiana tramite il portale Open Data (dati.cortecostituzionale.it, CC BY-SA 3.0).

Parametri:
- numero: numero sentenza
- anno: anno sentenza
- materia: materia o norma contestata
- parolaChiave: parola chiave full-text
- page / pageSize: paginazione`,
    inputSchema: {
      type: 'object',
      properties: {
        numero: { type: 'string' },
        anno: { type: 'number' },
        materia: { type: 'string' },
        parolaChiave: { type: 'string' },
        page: { type: 'number', minimum: 1 },
        pageSize: { type: 'number', minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: 'corte-costituzionale_get_sentenza',
    description: `Recupera il testo integrale di una sentenza della Corte Costituzionale tramite Open Data (dati.cortecostituzionale.it).

Parametri:
- numero (obbligatorio): numero sentenza
- anno (obbligatorio): anno sentenza`,
    inputSchema: {
      type: 'object',
      properties: {
        numero: { type: 'string' },
        anno: { type: 'number' },
      },
      required: ['numero', 'anno'],
    },
  },
  {
    name: 'corte-costituzionale_norme_incostituzionali',
    description: `Elenco delle norme dichiarate incostituzionali dalla Corte Costituzionale.

Parametri:
- anno: filtra per anno
- page / pageSize: paginazione`,
    inputSchema: {
      type: 'object',
      properties: {
        anno: { type: 'number' },
        page: { type: 'number', minimum: 1 },
        pageSize: { type: 'number', minimum: 1, maximum: 50 },
      },
    },
  },
];

export function createCorteCostituzionaleServer(): Server {
  const server = new Server(
    { name: 'corte-costituzionale', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'corte-costituzionale_search': {
          const input = SearchSentenzeInputSchema.parse(args);
          const result = await searchSentenze(input);
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true, data: result }, null, 2) }],
          };
        }
        case 'corte-costituzionale_get_sentenza': {
          const input = GetSentenzaInputSchema.parse(args);
          const result = await getSentenza(input);
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true, data: result }, null, 2) }],
          };
        }
        case 'corte-costituzionale_norme_incostituzionali': {
          const input = NormeIncostituzionaliInputSchema.parse(args);
          const result = await normeIncostituzionali(input);
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true, data: result }, null, 2) }],
          };
        }
        default:
          throw new Error(`Tool sconosciuto: ${name}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: message }, null, 2) }],
        isError: true,
      };
    }
  });

  return server;
}

async function main(): Promise<void> {
  const server = createCorteCostituzionaleServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Corte Costituzionale MCP server running on stdio');
  process.on('SIGINT', async () => { await server.close(); process.exit(0); });
  process.on('SIGTERM', async () => { await server.close(); process.exit(0); });
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
