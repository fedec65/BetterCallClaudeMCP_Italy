#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { SearchSentenzeInputSchema, GetSentenzaInputSchema } from './types.js';
import { searchGiustiziaAmministrativa } from './tools/search.js';
import { getSentenzaGiustiziaAmministrativa } from './tools/get-sentenza.js';

const tools: Tool[] = [
  {
    name: 'giustizia-amministrativa_search',
    description: `Ricerca sentenze di TAR e Consiglio di Stato.

⚠️ LIMITAZIONE: il portale giustizia-amministrativa.it utilizza Liferay ed è spesso instabile o lento. Lo scraping può fallire con timeout. In caso di errore, il tool restituisce URL diretti per la consultazione manuale.

Parametri:
- parolaChiave: parola chiave
- sezione: sezione giurisdizionale
- organo: "TAR" o "CONSIGLIO_DI_STATO"
- dataDa / dataA: range date (YYYY-MM-DD)
- page / pageSize: paginazione`,
    inputSchema: {
      type: 'object',
      properties: {
        parolaChiave: { type: 'string' },
        sezione: { type: 'string' },
        organo: { type: 'string', enum: ['TAR', 'CONSIGLIO_DI_STATO'] },
        dataDa: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        dataA: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        page: { type: 'number', minimum: 1 },
        pageSize: { type: 'number', minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: 'giustizia-amministrativa_get_sentenza',
    description: `Recupera il testo integrale di una sentenza del TAR o Consiglio di Stato.

Parametri:
- id (obbligatorio): identificativo sentenza`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
];

export function createGiustiziaAmministrativaServer(): Server {
  const server = new Server(
    { name: 'giustizia-amministrativa', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      switch (name) {
        case 'giustizia-amministrativa_search': {
          const input = SearchSentenzeInputSchema.parse(args);
          const result = await searchGiustiziaAmministrativa(input);
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, data: result }, null, 2) }] };
        }
        case 'giustizia-amministrativa_get_sentenza': {
          const input = GetSentenzaInputSchema.parse(args);
          const result = await getSentenzaGiustiziaAmministrativa(input);
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
  const server = createGiustiziaAmministrativaServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Giustizia Amministrativa MCP server running on stdio');
  process.on('SIGINT', async () => { await server.close(); process.exit(0); });
  process.on('SIGTERM', async () => { await server.close(); process.exit(0); });
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
