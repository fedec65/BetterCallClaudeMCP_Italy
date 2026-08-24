/**
 * Tool MCP di gestione delle sessioni ItalGiure (vault).
 */

import {
  deleteSession,
  getSessionStatus,
  isSessionStoreEnabled,
  setSession,
  type SessionStatus,
} from './session-store.js';

const VAULT_DISABLED_ERROR =
  'Session vault non configurato sul server (SESSION_STORE_SECRET mancante). ' +
  'Passa il cookie direttamente come parametro `cookie` oppure contatta l\'amministratore del servizio.';

function assertVaultEnabled(): void {
  if (!isSessionStoreEnabled()) {
    throw new Error(VAULT_DISABLED_ERROR);
  }
}

export function sessionSet(sessionKey: string, cookie: string): { registrata: true; stato: 'attiva' } {
  assertVaultEnabled();
  setSession(sessionKey, cookie);
  return { registrata: true, stato: 'attiva' };
}

export function sessionStatus(sessionKey: string): SessionStatus {
  assertVaultEnabled();
  return getSessionStatus(sessionKey);
}

export function sessionDelete(sessionKey: string): { eliminata: boolean } {
  assertVaultEnabled();
  return { eliminata: deleteSession(sessionKey) };
}
