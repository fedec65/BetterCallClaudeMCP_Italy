import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// Limiti bassi impostati PRIMA dell'import di app.ts: i limiter leggono le
// env var al momento della creazione (import del modulo).
process.env.MCP_RATE_LIMIT_MAX = '3';
process.env.GENERAL_RATE_LIMIT_MAX = '5';

const { app } = await import('../app.js');

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

function postMcp(body: unknown, serverName = 'unknown') {
  return fetch(`${baseUrl}/${serverName}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  });
}

describe('Rate limiter MCP', () => {
  it('non conta i metodi di handshake (initialize) anche oltre il limite', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await postMcp({
        jsonrpc: '2.0',
        id: i,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '0' },
        },
      });
      // 404 perche' il server "unknown" non esiste: conta che non sia 429
      expect(res.status).toBe(404);
    }
  });

  it('non conta tools/list e notifications/*', async () => {
    const res1 = await postMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res1.status).toBe(404);
    const res2 = await postMcp({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res2.status).toBe(404);
  });

  it('limita le chiamate tool oltre la soglia', async () => {
    const call = (i: number) =>
      postMcp({
        jsonrpc: '2.0',
        id: i,
        method: 'tools/call',
        params: { name: 'x', arguments: {} },
      });

    for (let i = 0; i < 3; i++) {
      const res = await call(i);
      expect(res.status).toBe(404); // entro il limite: arriva al router
    }
    const res = await call(99);
    expect(res.status).toBe(429);
  });

  it('mantiene bucket separati per IP diversi (X-Forwarded-For)', async () => {
    const res = await fetch(`${baseUrl}/unknown/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'X-Forwarded-For': '203.0.113.10',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'x', arguments: {} },
      }),
    });
    // IP diverso: non eredita il bucket esaurito del test precedente
    expect(res.status).toBe(404);
  });
});

describe('CORS', () => {
  it('consente https://claude.ai', async () => {
    const res = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'https://claude.ai' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://claude.ai');
  });

  it('rifiuta origini sconosciute', async () => {
    const res = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'https://evil.example.com' },
    });
    expect(res.status).toBe(500);
  });
});
