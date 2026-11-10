import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AxiosError } from 'axios';

/**
 * Il classificatore è già coperto dai test unitari di italgiure-client.test.ts:
 * qui si copre il cablaggio dei due `catch`, cioè la catena
 * parseApiError(error) → statusHttpErrore(error) →
 * classificaFallimentoItalgiure(code, message, status). Un argomento
 * scambiato o un ordine cambiato lascerebbe verdi i test unitari mentre in
 * produzione ogni 401 smetterebbe di essere classificato come problema di
 * cookie.
 *
 * Il client HTTP è finto: dal test non esce nessuna richiesta.
 */
const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn() }));

vi.mock('@bettercallclaude-italia/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@bettercallclaude-italia/shared')>();
  return {
    ...actual,
    // Client HTTP finto: nessuna rete.
    createHttpClient: vi.fn(() => ({ post: mockPost })),
    // fetchWithRetry reale aggiungerebbe rate limiting e retry: qui deve
    // propagare l'errore una sola volta, così il `catch` lo vede come
    // arriverebbe in produzione.
    fetchWithRetry: vi.fn(async (_api: string, fn: () => Promise<unknown>) => fn()),
  };
});

import { searchItalgiure, getSentenzaItalgiure } from '../tools/italgiure-client.js';

const COOKIE = 'ASPSESSIONID=abc123';

/**
 * Errore axios con una risposta HTTP: è il caso in cui il servizio ha
 * risposto e il `catch` deve distinguere 401/403 (sessione non accettata),
 * 5xx (errore del servizio) e 4xx.
 */
function erroreConRisposta(status: number): AxiosError {
  return new AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    {
      status,
      statusText: '',
      headers: {},
      config: undefined as never,
    }
  );
}

/**
 * Errore axios senza risposta HTTP: la connessione non ha raggiunto il
 * servizio (timeout, connessione non riuscita).
 */
function erroreSenzaRisposta(): AxiosError {
  return new AxiosError('timeout of 30000ms exceeded', 'ECONNABORTED');
}

async function cercaConErrore(errore: unknown): Promise<string> {
  mockPost.mockRejectedValue(errore);
  const r = await searchItalgiure({ query: 'responsabilità medica', cookie: COOKIE });
  expect(r.success).toBe(false);
  if (r.success) throw new Error('atteso il fallback');
  return r.fallback.istruzioni;
}

async function sentenzaConErrore(errore: unknown): Promise<string> {
  mockPost.mockRejectedValue(errore);
  const r = await getSentenzaItalgiure('snciv2024332127S', COOKIE);
  expect(r.success).toBe(false);
  if (r.success || r.cookieValido) throw new Error('atteso il fallback');
  return r.fallback.istruzioni;
}

beforeEach(() => {
  mockPost.mockReset();
});

describe('cablaggio degli errori in searchItalgiure', () => {
  it('un 401 finisce nel ramo cookie, con la procedura di rinnovo e senza il blocco per IP', async () => {
    const istruzioni = await cercaConErrore(erroreConRisposta(401));

    expect(istruzioni).toContain('Sessione ItalGiure');
    expect(istruzioni).toContain('HTTP 401');
    // Il testo dell'errore originale viene conservato: uno scambio fra code e
    // message cambierebbe il testo del messaggio senza cambiare il ramo.
    expect(istruzioni).toContain('Request failed with status code 401');
    // La procedura di rinnovo del cookie è allegata al ramo cookie.
    expect(istruzioni).toContain('ITALGIURE_COOKIE');
    // Non è il ramo di trasporto: la connessione ha raggiunto il servizio.
    expect(istruzioni).not.toContain('datacenter');
    expect(istruzioni).not.toContain('non ha raggiunto il servizio');
  });

  it('un errore senza risposta HTTP finisce nel ramo di trasporto', async () => {
    const istruzioni = await cercaConErrore(erroreSenzaRisposta());

    expect(istruzioni).toContain('datacenter');
    expect(istruzioni).toContain('italgiure-search');
    // Il canale client-side, non la procedura del cookie.
    expect(istruzioni).not.toContain('ITALGIURE_COOKIE');
  });

  it('un 500 non finisce nel ramo di trasporto', async () => {
    const istruzioni = await cercaConErrore(erroreConRisposta(500));

    expect(istruzioni).toContain('HTTP 500');
    expect(istruzioni).not.toContain('datacenter');
    expect(istruzioni).not.toContain('non ha raggiunto il servizio');
  });

  it('un 403 rimanda al canale lato client e mantiene la procedura di rinnovo', async () => {
    const istruzioni = await cercaConErrore(erroreConRisposta(403));

    expect(istruzioni).toContain('HTTP 403');
    expect(istruzioni).toContain('italgiure-search');
    expect(istruzioni).toContain('ITALGIURE_COOKIE');
  });
});

describe('cablaggio degli errori in getSentenzaItalgiure', () => {
  it('un 401 finisce nel ramo cookie, con la procedura di rinnovo e senza il blocco per IP', async () => {
    const istruzioni = await sentenzaConErrore(erroreConRisposta(401));

    expect(istruzioni).toContain('Sessione ItalGiure');
    expect(istruzioni).toContain('HTTP 401');
    expect(istruzioni).toContain('ITALGIURE_COOKIE');
    expect(istruzioni).not.toContain('datacenter');
    expect(istruzioni).not.toContain('non ha raggiunto il servizio');
  });

  it('un errore senza risposta HTTP finisce nel ramo di trasporto', async () => {
    const istruzioni = await sentenzaConErrore(erroreSenzaRisposta());

    expect(istruzioni).toContain('datacenter');
    expect(istruzioni).not.toContain('ITALGIURE_COOKIE');
  });

  it('un 500 non finisce nel ramo di trasporto', async () => {
    const istruzioni = await sentenzaConErrore(erroreConRisposta(500));

    expect(istruzioni).toContain('HTTP 500');
    expect(istruzioni).not.toContain('datacenter');
    expect(istruzioni).not.toContain('non ha raggiunto il servizio');
  });
});

describe('sentenza non trovata', () => {
  it('propone SentenzeWeb come raggiungibile dal browser dell\'utente, non dal server', async () => {
    mockPost.mockResolvedValue({
      data: { responseHeader: { status: 0, QTime: 1 }, response: { numFound: 0, start: 0, docs: [] } },
    });

    const r = await getSentenzaItalgiure('snciv2024332127S', COOKIE);
    expect(r.success).toBe(false);
    if (r.success || !r.cookieValido) throw new Error('attesa la sentenza non trovata');

    expect(r.messaggio).toContain('SentenzeWeb');
    expect(r.messaggio).toContain('browser');
  });
});
