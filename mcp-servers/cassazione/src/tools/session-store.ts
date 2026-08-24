/**
 * Session vault per i cookie ItalGiure.
 *
 * Consente a ciascun utente di registrare UNA volta il proprio cookie di
 * sessione tramite il tool `cassazione_session_set`, identificato da una
 * `session_key` (passphrase scelta dall'utente). I tool di ricerca possono
 * poi usare `session_key` al posto del cookie.
 *
 * Sicurezza:
 * - Le entry sono indicizzate per SHA-256(session_key): la chiave non e mai
 *   salvata in chiaro.
 * - Il cookie e cifrato AES-256-GCM con chiave derivata (scrypt) da
 *   SESSION_STORE_SECRET + salt casuale per-entry.
 * - Le miss (session_key inesistenti) sono throttled: max 20/min process-wide,
 *   come difesa in profondita' contro l'enumerazione delle passphrase.
 * - Il vault e DISABILITATO se SESSION_STORE_SECRET non e configurata: i tool
 *   session_* rispondono con errore esplicito.
 *
 * Persistenza: file JSON (path da SESSION_STORE_PATH, default
 * ./italgiure_sessions.json). Su Railway va montato su un volume.
 */

import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type SessionStato = 'attiva' | 'scaduta';

interface EncryptedEntry {
  iv: string;
  authTag: string;
  data: string;
  /** Salt scrypt per-entry (base64). Assente solo nelle entry legacy. */
  salt?: string;
  createdAt: string;
  lastKeepAlive?: string;
  stato: SessionStato;
}

interface VaultFile {
  version: 1;
  entries: Record<string, EncryptedEntry>;
}

export interface SessionStatus {
  presente: boolean;
  stato?: SessionStato;
  createdAt?: string;
  lastKeepAlive?: string;
}

const SCRYPT_SALT_LEGACY = 'bcc-italgiure-session-vault';

// Throttle anti brute-force sulle miss del vault (session_key inesistenti):
// max 20 miss process-wide al minuto. Il controllo scatta SOLO sulle miss:
// chi possiede una session_key valida non viene mai bloccato, cosi un attacco
// di enumerazione non puo' negare il servizio agli altri utenti (no DoS).
// Le passphrase >= 16 caratteri rendono gia' impraticabile l'enumerazione;
// questo e' difesa in profondita'.
const MISS_WINDOW_MS = 60_000;
const MISS_LIMIT = 20;
const missTimestamps: number[] = [];

/**
 * Registra una miss e lancia se oltre il limite nella finestra.
 * Va chiamata solo quando la session_key NON esiste nel vault.
 */
function recordMiss(): void {
  const now = Date.now();
  missTimestamps.push(now);
  while (missTimestamps.length > 0 && now - (missTimestamps[0] as number) > MISS_WINDOW_MS) {
    missTimestamps.shift();
  }
  if (missTimestamps.length > MISS_LIMIT) {
    throw new Error(
      'Troppi tentativi di accesso al session vault. Riprova tra un minuto.'
    );
  }
}

/** Azzera il contatore delle miss. Solo per i test. */
export function resetMissCounterForTests(): void {
  missTimestamps.length = 0;
}

function storeSecret(): string | undefined {
  const secret = process.env.SESSION_STORE_SECRET;
  return secret && secret.trim() ? secret.trim() : undefined;
}

/** Il vault e utilizzabile solo con SESSION_STORE_SECRET configurata. */
export function isSessionStoreEnabled(): boolean {
  return !!storeSecret();
}

function encryptionKey(salt: string): Buffer {
  return scryptSync(storeSecret() as string, salt, 32);
}

function storePath(): string {
  return process.env.SESSION_STORE_PATH
    ? resolve(process.env.SESSION_STORE_PATH)
    : resolve(process.cwd(), 'italgiure_sessions.json');
}

function keyHash(sessionKey: string): string {
  return createHash('sha256').update(sessionKey, 'utf-8').digest('hex');
}

function encrypt(plain: string): { iv: string; authTag: string; data: string; salt: string } {
  const iv = randomBytes(12);
  const salt = randomBytes(16).toString('base64');
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(salt), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
    salt,
  };
}

function decrypt(entry: EncryptedEntry): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    // Entry legacy (senza salt per-entry): deriva con il salt storico.
    encryptionKey(entry.salt ?? SCRYPT_SALT_LEGACY),
    Buffer.from(entry.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(entry.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(entry.data, 'base64')),
    decipher.final(),
  ]).toString('utf-8');
}

function loadVault(): VaultFile {
  const path = storePath();
  if (!existsSync(path)) return { version: 1, entries: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as VaultFile;
    if (parsed && parsed.version === 1 && typeof parsed.entries === 'object') {
      return parsed;
    }
  } catch {
    // file corrotto o illeggibile: si riparte da vault vuoto
  }
  return { version: 1, entries: {} };
}

function saveVault(vault: VaultFile): void {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(vault), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, path);
}

/** Salva o aggiorna il cookie per una session_key. */
export function setSession(sessionKey: string, cookie: string): void {
  const vault = loadVault();
  vault.entries[keyHash(sessionKey)] = {
    ...encrypt(cookie.trim()),
    createdAt: new Date().toISOString(),
    stato: 'attiva',
  };
  saveVault(vault);
}

/**
 * Recupera il cookie per una session_key.
 * Restituisce undefined se assente o marcata scaduta dal keep-alive.
 */
export function getSessionCookie(sessionKey: string): string | undefined {
  const entry = loadVault().entries[keyHash(sessionKey)];
  if (!entry) {
    recordMiss();
    return undefined;
  }
  if (entry.stato !== 'attiva') return undefined;
  try {
    return decrypt(entry);
  } catch {
    return undefined;
  }
}

/** Stato della sessione senza esporre il cookie. */
export function getSessionStatus(sessionKey: string): SessionStatus {
  const entry = loadVault().entries[keyHash(sessionKey)];
  if (!entry) {
    recordMiss();
    return { presente: false };
  }
  return {
    presente: true,
    stato: entry.stato,
    createdAt: entry.createdAt,
    lastKeepAlive: entry.lastKeepAlive,
  };
}

/** Elimina la sessione. Restituisce true se esisteva. */
export function deleteSession(sessionKey: string): boolean {
  const vault = loadVault();
  const hash = keyHash(sessionKey);
  if (!vault.entries[hash]) {
    recordMiss();
    return false;
  }
  delete vault.entries[hash];
  saveVault(vault);
  return true;
}

/** Marca una sessione come scaduta (usato dal keep-alive). */
export function markSessionExpired(sessionKey: string): void {
  const vault = loadVault();
  const entry = vault.entries[keyHash(sessionKey)];
  if (!entry) return;
  entry.stato = 'scaduta';
  saveVault(vault);
}

/**
 * Tutte le sessioni attive, per il keep-alive. Restituisce coppie
 * (hash interno, cookie decifrato): la session_key originale non e
 * recuperabile per design.
 */
export function listActiveSessions(): Array<{ hash: string; cookie: string }> {
  const vault = loadVault();
  const out: Array<{ hash: string; cookie: string }> = [];
  for (const [hash, entry] of Object.entries(vault.entries)) {
    if (entry.stato !== 'attiva') continue;
    try {
      out.push({ hash, cookie: decrypt(entry) });
    } catch {
      // entry illeggibile (secret cambiata?): ignorata
    }
  }
  return out;
}

/** Aggiorna il timestamp di keep-alive; marca scaduta se expired=true. */
export function recordKeepAlive(hash: string, expired: boolean): void {
  const vault = loadVault();
  const entry = vault.entries[hash];
  if (!entry) return;
  entry.lastKeepAlive = new Date().toISOString();
  if (expired) entry.stato = 'scaduta';
  saveVault(vault);
}
