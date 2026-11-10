import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Le descrizioni dei tool sono lette dal modello a ogni invocazione: se
 * dichiarano un requisito falso (un cookie che non serve) il modello chiede
 * all'utente un cookie che non risolve niente. Qui si verifica che le
 * descrizioni non contraddicano la diagnostica misurata.
 */
const indexSrc = readFileSync(resolve(__dirname, '..', 'index.ts'), 'utf8');

describe('descrizioni dei tool cassazione', () => {
  it('non dicono piu\' "esegui document.cookie"', () => {
    expect(indexSrc).not.toContain('esegui document.cookie');
  });

  it('non dicono piu\' che il tool richiede un cookie attivo', () => {
    expect(indexSrc).not.toContain('richiede un cookie di sessione ItalGiure attivo');
  });

  it('nomina il blocco per IP', () => {
    expect(indexSrc).toContain('datacenter');
  });

  it('rimanda al canale client-side', () => {
    expect(indexSrc).toContain('italgiure-search');
  });

  it('non promette un messaggio quando la ricerca non restituisce risultati', () => {
    expect(indexSrc).not.toContain('Se la ricerca non restituisce risultati');
  });

  it('promette il messaggio quando la ricerca non è eseguibile', () => {
    expect(indexSrc).toContain('non è eseguibile');
  });
});
