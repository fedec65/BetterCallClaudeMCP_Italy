import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * La descrizione del tool viene letta dal modello a ogni invocazione: se
 * raggruppa sotto "fonte non raggiungibile" anche il cookie mancante,
 * dichiara un equivoco che il runtime non ha più — senza cookie la
 * richiesta non viene nemmeno inviata.
 */
const indexSrc = readFileSync(resolve(__dirname, '..', 'index.ts'), 'utf8');

const descrizione = (() => {
  const inizio = indexSrc.indexOf("name: 'citation-verify-ita_check_existence'");
  const fine = indexSrc.indexOf("name: '", inizio + 1);
  return indexSrc.slice(inizio, fine);
})();

describe('descrizione del tool citation-verify-ita_check_existence', () => {
  it('non raggruppa il cookie mancante fra le cause di fonte non raggiungibile', () => {
    expect(descrizione).not.toContain('Se la fonte non è raggiungibile (es. cookie');
    expect(descrizione).not.toContain('es. cookie ItalGiure mancante');
  });

  it('distingue il caso in cui la richiesta non è stata inviata', () => {
    expect(descrizione).toContain('mancanza del cookie');
    expect(descrizione).toContain('non viene inviata a ItalGiure');
  });

  it('distingue il caso in cui la connessione non ha raggiunto il servizio', () => {
    expect(descrizione).toContain('fonte non raggiungibile');
    expect(descrizione).toContain('non ha raggiunto il servizio');
  });

  it('promette ancora l\'errore SOURCE_UNAVAILABLE senza inventare contenuto', () => {
    expect(descrizione).toContain('SOURCE_UNAVAILABLE');
    expect(descrizione).toContain('senza inventare contenuto');
  });
});

/**
 * Il README del pacchetto ripete la stessa distinzione: il cookie mancante
 * non è una fonte irraggiungibile, è una richiesta mai inviata.
 */
const readme = readFileSync(resolve(__dirname, '..', '..', 'README.md'), 'utf8');

describe('README del pacchetto citation-verify-ita', () => {
  it('non raggruppa il cookie mancante fra le cause di fonte non raggiungibile', () => {
    expect(readme).not.toContain('Se la fonte non è raggiungibile (cookie ItalGiure assente/scaduto');
  });

  it('distingue il caso in cui la richiesta non è stata inviata', () => {
    expect(readme).toContain('non viene inviata a ItalGiure');
  });

  it('distingue il caso in cui la fonte è stata interrogata e non è raggiungibile', () => {
    expect(readme).toContain('Fonte interrogata e non raggiungibile');
  });
});
