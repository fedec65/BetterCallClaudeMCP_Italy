#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { CheckExistenceInputSchema } from './types.js';
import { checkExistence } from './tools/check-existence.js';

const SERVER_NAME = 'citation-verify-ita';
const SERVER_VERSION = '1.0.0';

const tools: Tool[] = [
  {
    name: 'citation-verify-ita_check_existence',
    description: `Verifica l'esistenza di una citazione giuridica italiana interrogando le fonti ufficiali.

Riconosce:
- Sentenze Cassazione (es. "Cass. n. 12345/2024", "Cassazione civile Sez. 3, n. 32127 del 2024") → verifica su ItalGiure (CED Ministero della Giustizia)
- Atti normativi (es. "D.Lgs. 231/2001", "Legge 24 agosto 2017, n. 123") → verifica su Normattiva Open Data
- Codici abbreviati (es. "art. 1456 c.c.", "art. 360 c.p.c.") → verifica l'atto istitutivo del codice

Parametri:
- citazione (obbligatorio): la citazione da verificare
- italgiure_cookie (opzionale): cookie di sessione ItalGiure, necessario per le citazioni di giurisprudenza. Se omesso, il server usa ITALGIURE_COOKIE env var o italgiure_cookie.txt.

IMPORTANTE: questo tool verifica solo l'ESISTENZA della fonte, non se il contenuto supporta una specifica affermazione (implicazione). La verifica di implicazione resta responsabilità del client/LLM.

Se la fonte non è raggiungibile (es. cookie ItalGiure mancante), il tool fallisce con errore SOURCE_UNAVAILABLE senza inventare contenuto.`,
    inputSchema: {
      type: 'object',
      properties: {
        citazione: { type: 'string', description: 'Citazione giuridica da verificare' },
        italgiure_cookie: { type: 'string', description: 'Cookie di sessione ItalGiure (opzionale)' },
      },
      required: ['citazione'],
    },
  },
];

export function createCitationVerifyItaServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'citation-verify-ita_check_existence': {
          const input = CheckExistenceInputSchema.parse(args);
          const result = await checkExistence(input);
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
  const server = createCitationVerifyItaServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Citation Verify ITA MCP server running on stdio');

  process.on('SIGINT', async () => { await server.close(); process.exit(0); });
  process.on('SIGTERM', async () => { await server.close(); process.exit(0); });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
