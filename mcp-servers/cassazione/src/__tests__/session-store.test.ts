import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'bcc-vault-test-'));
process.env.SESSION_STORE_SECRET = 'test-secret-per-i-test';
process.env.SESSION_STORE_PATH = join(tmpDir, 'sessions.json');

const store = await import('../tools/session-store.js');
const tools = await import('../tools/session-tools.js');
const { getItalgiureCookie } = await import('../tools/italgiure-client.js');

const KEY = 'passphrase-di-test-123';
const COOKIE = 'ASPSESSIONIDTEST=abc123def456';

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  store.deleteSession(KEY);
});

describe('session-store', () => {
  it('vault abilitato con SESSION_STORE_SECRET', () => {
    expect(store.isSessionStoreEnabled()).toBe(true);
  });

  it('set/get roundtrip del cookie', () => {
    store.setSession(KEY, COOKIE);
    expect(store.getSessionCookie(KEY)).toBe(COOKIE);
  });

  it('chiave sbagliata non restituisce nulla', () => {
    store.setSession(KEY, COOKIE);
    expect(store.getSessionCookie('altra-passphrase')).toBeUndefined();
  });

  it('il file su disco non contiene cookie ne session_key in chiaro', () => {
    store.setSession(KEY, COOKIE);
    const raw = readFileSync(process.env.SESSION_STORE_PATH as string, 'utf-8');
    expect(raw).not.toContain(COOKIE);
    expect(raw).not.toContain(KEY);
  });

  it('status senza esporre il cookie', () => {
    store.setSession(KEY, COOKIE);
    const status = store.getSessionStatus(KEY);
    expect(status.presente).toBe(true);
    expect(status.stato).toBe('attiva');
    expect(status.createdAt).toBeDefined();
    expect(JSON.stringify(status)).not.toContain(COOKIE);
  });

  it('delete rimuove la sessione', () => {
    store.setSession(KEY, COOKIE);
    expect(store.deleteSession(KEY)).toBe(true);
    expect(store.getSessionCookie(KEY)).toBeUndefined();
    expect(store.deleteSession(KEY)).toBe(false);
  });

  it('sessione scaduta non restituisce il cookie', () => {
    store.setSession(KEY, COOKIE);
    store.markSessionExpired(KEY);
    expect(store.getSessionCookie(KEY)).toBeUndefined();
    expect(store.getSessionStatus(KEY).stato).toBe('scaduta');
  });

  it('listActiveSessions + recordKeepAlive', () => {
    store.setSession(KEY, COOKIE);
    const active = store.listActiveSessions();
    expect(active.length).toBe(1);
    expect(active[0].cookie).toBe(COOKIE);
    store.recordKeepAlive(active[0].hash, false);
    expect(store.getSessionStatus(KEY).lastKeepAlive).toBeDefined();
    store.recordKeepAlive(active[0].hash, true);
    expect(store.getSessionStatus(KEY).stato).toBe('scaduta');
  });
});

describe('session-tools', () => {
  it('sessionSet registra e sessionStatus conferma', () => {
    tools.sessionSet(KEY, COOKIE);
    expect(tools.sessionStatus(KEY).presente).toBe(true);
  });

  it('sessionDelete elimina', () => {
    tools.sessionSet(KEY, COOKIE);
    expect(tools.sessionDelete(KEY)).toEqual({ eliminata: true });
    expect(tools.sessionStatus(KEY).presente).toBe(false);
  });
});

describe('getItalgiureCookie con session_key', () => {
  it('risolve il cookie dal vault via session_key', () => {
    store.setSession(KEY, COOKIE);
    delete process.env.ITALGIURE_COOKIE;
    expect(getItalgiureCookie(undefined, KEY)).toBe(COOKIE);
  });

  it('il parametro cookie ha priorita sul vault', () => {
    store.setSession(KEY, COOKIE);
    expect(getItalgiureCookie('DIRECT=1', KEY)).toBe('DIRECT=1');
  });
});

describe('throttle anti brute-force', () => {
  it('dopo 20 miss consecutive le miss vengono bloccate, ma le chiavi valide no', () => {
    store.resetMissCounterForTests();
    store.setSession(KEY, COOKIE);
    for (let i = 0; i < 20; i++) {
      expect(store.getSessionStatus(`chiave-inesistente-${i}`).presente).toBe(false);
    }
    // La 21esima miss supera il limite e lancia
    expect(() => store.getSessionStatus('chiave-inesistente-21')).toThrow(/Troppi tentativi/);
    // Ma una session_key valida non viene mai bloccata (no DoS verso gli utenti)
    expect(store.getSessionCookie(KEY)).toBe(COOKIE);
    expect(store.getSessionStatus(KEY).presente).toBe(true);
    store.resetMissCounterForTests();
  });
});
