#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { SearchMassimeInputSchema, GetSentenzaInputSchema, SessionSetInputSchema, SessionKeyInputSchema } from './types.js';
import { searchMassime } from './tools/search-massime.js';
import { getSentenzaCassazione } from './tools/get-sentenza.js';
import { sessionDelete, sessionSet, sessionStatus } from './tools/session-tools.js';
import { startSessionKeepAlive } from './tools/session-keepalive.js';

const tools: Tool[] = [
  {
    name: 'cassazione_search_massime',
    description: `Ricerca sentenze e massime della Corte di Cassazione tramite API Solr di ItalGiure (CED Ministero della Giustizia).

⚠️ LIMITE DI RAGGIUNGIBILITÀ: questo server gira su un indirizzo IP di datacenter e
www.italgiure.giustizia.it scarta a livello di rete (timeout di connessione) le
richieste che arrivano da quel tipo di indirizzo, con o senza cookie. Di conseguenza
questa ricerca dal server tende a restituire zero risultati. Il canale supportato per
la ricerca Cassazione è lato CLIENT: la skill italgiure-search del plugin
BetterCallClaude Italia interroga lo stesso indice pubblico SentenzeWeb direttamente
dal computer dell'utente, dove l'IP è ammesso, e restituisce la stessa forma di
questo tool.

Parametri:
- query (obbligatorio): parole chiave o sintassi Solr (es. "responsabilità medica")
- materia (opzionale): "civile" o "penale"
- anno (opzionale): anno della sentenza (es. 2024)
- tipo (opzionale): "sentenza", "ordinanza" o "decreto"
- page (opzionale): numero pagina (default 1)
- pageSize (opzionale): risultati per pagina, max 50 (default 20)
- cookie (opzionale): cookie di sessione ItalGiure
- session_key (opzionale): chiave di una sessione registrata via cassazione_session_set — il cookie viene letto dal vault lato server, senza passarlo a ogni chiamata

Se la ricerca non restituisce risultati, il campo autenticazione.messaggio spiega il
motivo e indica il percorso alternativo.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Parole chiave di ricerca' },
        materia: { type: 'string', enum: ['civile', 'penale'], description: 'Materia della sentenza' },
        anno: { type: 'number', minimum: 1, description: 'Anno della sentenza' },
        tipo: { type: 'string', enum: ['sentenza', 'ordinanza', 'decreto'], description: 'Tipo di provvedimento' },
        page: { type: 'number', minimum: 1, description: 'Numero pagina' },
        pageSize: { type: 'number', minimum: 1, maximum: 50, description: 'Risultati per pagina' },
        cookie: { type: 'string', description: 'Cookie di sessione ItalGiure' },
        session_key: { type: 'string', description: 'Chiave sessione registrata via cassazione_session_set' },
      },
      required: ['query'],
    },
  },
  {
    name: 'cassazione_get_sentenza',
    description: `Recupera i metadati di una singola sentenza della Corte di Cassazione tramite ItalGiure.

⚠️ LIMITE DI RAGGIUNGIBILITÀ: come per cassazione_search_massime, questo server non
raggiunge www.italgiure.giustizia.it dal proprio IP di datacenter (timeout di
connessione, con o senza cookie). Per il recupero di una sentenza usa il canale
lato client (skill italgiure-search del plugin BetterCallClaude Italia).

Parametri:
- id (obbligatorio): identificativo sentenza (es. snciv2024332127S)
- cookie (opzionale): cookie di sessione ItalGiure
- session_key (opzionale): chiave di una sessione registrata via cassazione_session_set

Restituisce estremi, sezione, tipo, date e URL al PDF quando disponibili.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Identificativo sentenza' },
        cookie: { type: 'string', description: 'Cookie di sessione ItalGiure' },
        session_key: { type: 'string', description: 'Chiave sessione registrata via cassazione_session_set' },
      },
      required: ['id'],
    },
  },
  {
    name: 'cassazione_session_set',
    description: `Registra il cookie di sessione ItalGiure nel vault lato server, associandolo a una session_key (passphrase min 16 caratteri scelta dall'utente).

Dopo la registrazione, i tool cassazione_search_massime e cassazione_get_sentenza possono usare session_key al posto del cookie. Il cookie e cifrato AES-256-GCM a riposo e la session_key non viene mai salvata in chiaro (solo hash SHA-256). Un keep-alive ogni 6 ore mantiene la sessione viva e ne segnala la scadenza.

Parametri:
- session_key (obbligatoria): passphrase scelta dall'utente
- cookie (obbligatorio): cookie di sessione ItalGiure`,
    inputSchema: {
      type: 'object',
      properties: {
        session_key: { type: 'string', minLength: 16, description: 'Passphrase della sessione (min 16 caratteri)' },
        cookie: { type: 'string', description: 'Cookie di sessione ItalGiure' },
      },
      required: ['session_key', 'cookie'],
    },
  },
  {
    name: 'cassazione_session_status',
    description: `Verifica se una sessione ItalGiure e registrata e il suo stato (attiva/scaduta, data registrazione, ultimo keep-alive). Non espone il cookie.

Parametri:
- session_key (obbligatoria): passphrase della sessione`,
    inputSchema: {
      type: 'object',
      properties: {
        session_key: { type: 'string', minLength: 16, description: 'Passphrase della sessione' },
      },
      required: ['session_key'],
    },
  },
  {
    name: 'cassazione_session_delete',
    description: `Elimina una sessione ItalGiure registrata dal vault lato server.

Parametri:
- session_key (obbligatoria): passphrase della sessione`,
    inputSchema: {
      type: 'object',
      properties: {
        session_key: { type: 'string', minLength: 16, description: 'Passphrase della sessione' },
      },
      required: ['session_key'],
    },
  },
];

export function createCassazioneServer(): Server {
  const server = new Server(
    { name: 'cassazione', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // Singleton interno: nessun doppio intervallo se la factory viene chiamata
  // per ogni richiesta (modalita' stateless dell'aggregatore HTTP).
  startSessionKeepAlive();

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
        case 'cassazione_session_set': {
          const input = SessionSetInputSchema.parse(args);
          const result = sessionSet(input.session_key, input.cookie);
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, data: result }, null, 2) }] };
        }
        case 'cassazione_session_status': {
          const input = SessionKeyInputSchema.parse(args);
          const result = sessionStatus(input.session_key);
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, data: result }, null, 2) }] };
        }
        case 'cassazione_session_delete': {
          const input = SessionKeyInputSchema.parse(args);
          const result = sessionDelete(input.session_key);
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
