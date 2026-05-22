#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  SearchInputSchema,
  SearchAdvancedInputSchema,
  GetAttoInputSchema,
  ElencoTipiInputSchema,
} from './types.js';
import { searchNormattiva } from './tools/search.js';
import { searchNormattivaAdvanced } from './tools/search-advanced.js';
import { getAttoNormattiva } from './tools/get-atto.js';
import { elencoTipiNormattiva } from './tools/elenco-tipi.js';

const SERVER_NAME = 'normattiva';
const SERVER_VERSION = '1.0.0';

const tools: Tool[] = [
  {
    name: 'normattiva_search',
    description: `Ricerca semplice negli atti normativi italiani tramite Normattiva.

Cerca parole chiave nel titolo e/o nel testo degli atti normativi dal 1861 ad oggi.

Parametri:
- query (obbligatorio): parole chiave di ricerca
- orderType (opzionale): "recente" o "vecchio"
- page (opzionale): numero pagina (default 1)
- pageSize (opzionale): risultati per pagina, max 50 (default 20)
- format (opzionale): formato esportazione (JSON, HTML, AKN, XML, PDF, EPUB, RTF, URI)

Restituisce elenco atti con URN, titolo, tipo, numero, anno, date, stato.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Parole chiave di ricerca' },
        orderType: { type: 'string', enum: ['recente', 'vecchio'], description: 'Ordine risultati' },
        page: { type: 'number', minimum: 1, description: 'Numero pagina' },
        pageSize: { type: 'number', minimum: 1, maximum: 50, description: 'Risultati per pagina' },
        format: { type: 'string', enum: ['JSON', 'HTML', 'AKN', 'XML', 'PDF', 'EPUB', 'RTF', 'URI'], description: 'Formato esportazione' },
      },
      required: ['query'],
    },
  },
  {
    name: 'normattiva_search_advanced',
    description: `Ricerca avanzata negli atti normativi italiani tramite Normattiva.

Permette di filtrare per tipo di atto, date di emanazione/pubblicazione, numero, vigenza.

Parametri:
- testoRicerca: parole nel testo
- titoloRicerca: parole nel titolo
- dataInizioEmanazione / dataFineEmanazione: date emanazione (YYYY-MM-DD)
- dataInizioPubblicazione / dataFinePubblicazione: date pubblicazione (YYYY-MM-DD)
- vigenza: data vigenza (YYYY-MM-DD)
- classeProvvedimento: ID classe provvedimento (usa normattiva_elenco_tipi)
- denominazioneAtto: tipo atto (es. DECRETO, LEGGE)
- annoProvvedimento: anno emanazione
- numeroProvvedimento: numero provvedimento
- orderType, page, pageSize, format: come ricerca semplice`,
    inputSchema: {
      type: 'object',
      properties: {
        testoRicerca: { type: 'string', description: 'Parole nel testo' },
        titoloRicerca: { type: 'string', description: 'Parole nel titolo' },
        dataInizioEmanazione: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Data emanazione da (YYYY-MM-DD)' },
        dataFineEmanazione: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Data emanazione a (YYYY-MM-DD)' },
        dataInizioPubblicazione: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Data pubblicazione da (YYYY-MM-DD)' },
        dataFinePubblicazione: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Data pubblicazione a (YYYY-MM-DD)' },
        vigenza: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Data vigenza (YYYY-MM-DD)' },
        classeProvvedimento: { type: 'string', description: 'ID classe provvedimento' },
        denominazioneAtto: { type: 'string', description: 'Tipo di atto (es. DECRETO, LEGGE)' },
        annoProvvedimento: { type: 'number', description: 'Anno emanazione' },
        numeroProvvedimento: { type: 'string', description: 'Numero provvedimento' },
        orderType: { type: 'string', enum: ['recente', 'vecchio'], description: 'Ordine risultati' },
        page: { type: 'number', minimum: 1, description: 'Numero pagina' },
        pageSize: { type: 'number', minimum: 1, maximum: 50, description: 'Risultati per pagina' },
        format: { type: 'string', enum: ['JSON', 'HTML', 'AKN', 'XML', 'PDF', 'EPUB', 'RTF', 'URI'], description: 'Formato esportazione' },
      },
    },
  },
  {
    name: 'normattiva_get_atto',
    description: `Recupera i metadati di un atto normativo tramite codice redazionale e data GU.

Parametri:
- codiceRedazionale (obbligatorio): codice redazionale (es. 24G00010)
- dataGU (obbligatorio): data pubblicazione GU (YYYY-MM-DD)

Restituisce metadati completi e URL al portale Normattiva.`,
    inputSchema: {
      type: 'object',
      properties: {
        codiceRedazionale: { type: 'string', description: 'Codice redazionale dell\'atto' },
        dataGU: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Data pubblicazione GU (YYYY-MM-DD)' },
      },
      required: ['codiceRedazionale', 'dataGU'],
    },
  },
  {
    name: 'normattiva_elenco_tipi',
    description: `Elenca le tipologie di provvedimento disponibili in Normattiva.

Parametri:
- tipo (obbligatorio): "classe" per classi di provvedimento, "denominazione" per denominazioni atto, "estensioni" per formati di esportazione

Restituisce lista di ID e nomi da usare come filtri nella ricerca avanzata.`,
    inputSchema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['classe', 'denominazione', 'estensioni'], description: 'Tipologia da elencare' },
      },
      required: ['tipo'],
    },
  },
];

export function createNormattivaServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'normattiva_search': {
          const input = SearchInputSchema.parse(args);
          const result = await searchNormattiva(input);
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true, data: result }, null, 2) }],
          };
        }
        case 'normattiva_search_advanced': {
          const input = SearchAdvancedInputSchema.parse(args);
          const result = await searchNormattivaAdvanced(input);
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true, data: result }, null, 2) }],
          };
        }
        case 'normattiva_get_atto': {
          const input = GetAttoInputSchema.parse(args);
          const result = await getAttoNormattiva(input);
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: true, data: result }, null, 2) }],
          };
        }
        case 'normattiva_elenco_tipi': {
          const input = ElencoTipiInputSchema.parse(args);
          const result = await elencoTipiNormattiva(input);
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
  const server = createNormattivaServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Normattiva MCP server running on stdio');

  process.on('SIGINT', async () => { await server.close(); process.exit(0); });
  process.on('SIGTERM', async () => { await server.close(); process.exit(0); });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
