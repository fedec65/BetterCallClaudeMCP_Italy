import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * L'import di index.ts avvierebbe anche il trasporto stdio del server: qui il
 * trasporto è finto, così il test non aggancia lo stdin del runner.
 */
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {
    onmessage?: (message: unknown, extra?: unknown) => void;
    onerror?: (error: unknown) => void;
    onclose?: () => void;
    async start(): Promise<void> {}
    async close(): Promise<void> {}
    async send(): Promise<void> {}
  },
}));

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createCassazioneServer } from '../index.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * Il cookie di sessione può arrivare da tre posti (parametro, env var,
 * file locale): per provare il ramo "senza cookie" nessuno dei tre deve
 * essere presente, altrimenti il test non proverebbe il ramo che dice di
 * provare.
 */
const fileCookie = [
  resolve(process.cwd(), 'italgiure_cookie.txt'),
  resolve(__dirname, '..', '..', 'italgiure_cookie.txt'),
];
const cookiePresente = fileCookie.some((p) => existsSync(p));

let client: Client;
let server: Server;

beforeAll(async () => {
  server = createCassazioneServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
});

afterAll(async () => {
  await client.close();
  await server.close();
});

beforeEach(() => {
  delete process.env.ITALGIURE_COOKIE;
});

/**
 * Chiama il tool e restituisce l'envelope JSON prodotto dal handler.
 */
async function chiamaTool(name: string, args: Record<string, unknown>): Promise<any> {
  const res = await client.callTool({ name, arguments: args });
  const contenuto = res.content as Array<{ type: string; text?: string }>;
  const testo = contenuto.find((c) => c.type === 'text')?.text;
  if (testo === undefined) throw new Error('il tool non ha restituito contenuto testuale');
  return JSON.parse(testo);
}

describe.skipIf(cookiePresente)('envelope MCP del server cassazione senza cookie', () => {
  it('la chiamata riesce a livello MCP e il fallimento è dentro data', async () => {
    const envelope = await chiamaTool('cassazione_search_massime', {
      query: 'responsabilità medica',
    });

    expect(envelope.success).toBe(true);
    expect(envelope.error).toBeUndefined();

    expect(envelope.data.totale).toBe(0);
    expect(envelope.data.autenticazione.cookieValido).toBe(false);
    expect(typeof envelope.data.autenticazione.messaggio).toBe('string');
    expect(envelope.data.autenticazione.messaggio.length).toBeGreaterThan(0);

    expect(envelope.data.fallback).toBeDefined();
    expect(envelope.data.fallback.urlGoogle).toContain('google.com');
    expect(envelope.data.fallback.urlDuckDuckGo).toContain('duckduckgo.com');
  });

  it('cassazione_get_sentenza riusce a livello MCP e non ha il campo totale', async () => {
    const envelope = await chiamaTool('cassazione_get_sentenza', {
      id: 'snciv2024332127S',
    });

    expect(envelope.success).toBe(true);
    expect(envelope.error).toBeUndefined();

    expect(envelope.data.autenticazione.cookieValido).toBe(false);
    expect(typeof envelope.data.autenticazione.messaggio).toBe('string');
    expect(envelope.data.totale).toBeUndefined();

    expect(envelope.data.fallback.urlItalgiure).toContain('italgiure.giustizia.it');
    expect(envelope.data.fallback.urlSentenzeWeb).toContain('italgiure.giustizia.it');
  });
});
