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

/**
 * Le promesse di `autenticazione.messaggio` riguardano la descrizione di
 * `cassazione_search_massime`: il blocco è isolato dal resto del file perché
 * una corrispondenza in un'altra descrizione non può soddisfare l'asserzione
 * al posto suo.
 */
const descrizioneSearchMassime = (() => {
  const inizio = indexSrc.indexOf("name: 'cassazione_search_massime'");
  const fine = indexSrc.indexOf("name: '", inizio + 1);
  return indexSrc.slice(inizio, fine);
})();

describe('descrizioni dei tool cassazione', () => {
  it('non dicono più "esegui document.cookie"', () => {
    expect(indexSrc).not.toContain('esegui document.cookie');
  });

  it('non dicono più che il tool richiede un cookie attivo', () => {
    expect(indexSrc).not.toContain('richiede un cookie di sessione ItalGiure attivo');
  });

  it('nomina il blocco per IP', () => {
    expect(indexSrc).toContain('datacenter');
  });

  it('rimanda al canale client-side', () => {
    expect(indexSrc).toContain('italgiure-search');
  });

  it('non promette un messaggio quando la ricerca non restituisce risultati', () => {
    expect(descrizioneSearchMassime).not.toContain('Se la ricerca non restituisce risultati');
  });

  it('promette il messaggio quando la ricerca non è eseguibile', () => {
    expect(descrizioneSearchMassime).toContain('non è eseguibile');
  });

  it('separa il messaggio di autenticazione dal percorso alternativo', () => {
    expect(descrizioneSearchMassime).not.toContain('indica il percorso alternativo');
    expect(descrizioneSearchMassime).toContain('nel campo fallback');
  });

  it('dichiara che la ricerca dal server tende a fallire, non a restituire zero risultati', () => {
    expect(descrizioneSearchMassime).not.toContain('tende a restituire zero risultati');
    expect(descrizioneSearchMassime).toContain('tende a fallire');
  });

  it('dichiara cosa restituisce una ricerca eseguita che non trova nulla', () => {
    expect(descrizioneSearchMassime).toContain(
      'restituisce totale 0 e autenticazione.cookieValido true'
    );
  });
});
