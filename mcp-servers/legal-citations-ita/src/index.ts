#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  ValidateCitationInputSchema,
  ParseCitationInputSchema,
  FormatCitationInputSchema,
} from './types.js';
import { validateCitation } from './tools/validate-citation.js';
import { parseCitation } from './tools/parse-citation.js';
import { formatCitation } from './tools/format-citation.js';

const tools: Tool[] = [
  {
    name: 'legal-citations-ita_validate',
    description: `Valida una citazione normativa italiana.

Parametri:
- citation (obbligatorio): citazione da validare (es. "D.Lgs. 231/2001")`,
    inputSchema: {
      type: 'object',
      properties: {
        citation: { type: 'string' },
      },
      required: ['citation'],
    },
  },
  {
    name: 'legal-citations-ita_parse',
    description: `Parsa una citazione normativa italiana estraendo tipo, numero, anno, articolo, comma.

Parametri:
- citation (obbligatorio): citazione da parsare`,
    inputSchema: {
      type: 'object',
      properties: {
        citation: { type: 'string' },
      },
      required: ['citation'],
    },
  },
  {
    name: 'legal-citations-ita_format',
    description: `Formatta una citazione normativa in forma breve o completa.

Parametri:
- tipo (obbligatorio): tipo atto
- numero (obbligatorio): numero
- anno (obbligatorio): anno
- formato (opzionale): "breve" o "completo"`,
    inputSchema: {
      type: 'object',
      properties: {
        tipo: { type: 'string' },
        numero: { type: 'string' },
        anno: { type: 'number' },
        formato: { type: 'string', enum: ['breve', 'completo'] },
      },
      required: ['tipo', 'numero', 'anno'],
    },
  },
];

export function createLegalCitationsItaServer(): Server {
  const server = new Server(
    { name: 'legal-citations-ita', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      switch (name) {
        case 'legal-citations-ita_validate': {
          const input = ValidateCitationInputSchema.parse(args);
          const result = await validateCitation(input);
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, data: result }, null, 2) }] };
        }
        case 'legal-citations-ita_parse': {
          const input = ParseCitationInputSchema.parse(args);
          const result = await parseCitation(input);
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, data: result }, null, 2) }] };
        }
        case 'legal-citations-ita_format': {
          const input = FormatCitationInputSchema.parse(args);
          const result = await formatCitation(input);
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
  const server = createLegalCitationsItaServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Legal Citations ITA MCP server running on stdio');
  process.on('SIGINT', async () => { await server.close(); process.exit(0); });
  process.on('SIGTERM', async () => { await server.close(); process.exit(0); });
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
