import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * La guida di setup è il primo documento che legge chi installa il server:
 * se contraddice i messaggi dei tool, l'utente cerca un cookie che non
 * esiste o pensa che il connettore funzioni senza.
 */
const readme = readFileSync(resolve(__dirname, '..', '..', '..', '..', 'README.md'), 'utf8');

/**
 * Le verifiche sulla forma della risposta riguardano il paragrafo «Cosa
 * succede senza cookie»: è isolato dal resto del README perché una
 * corrispondenza in un'altra sezione non può soddisfare l'asserzione al posto
 * suo.
 */
const sezioneCookie = readme.slice(
  readme.indexOf('### Cassazione — Setup cookie ItalGiure'),
  readme.indexOf('## Configurazione plugin BetterCallClaude')
);

const paragrafoSenzaCookie = sezioneCookie.slice(
  sezioneCookie.indexOf('#### Cosa succede senza cookie'),
  sezioneCookie.indexOf('#### Come ottenere e configurare il cookie')
);

describe('README — setup cookie ItalGiure', () => {
  it('non suggerisce document.cookie (i cookie sono HttpOnly)', () => {
    expect(readme).not.toContain('document.cookie');
  });

  it('non nomina un cookie non verificato', () => {
    expect(readme).not.toContain('JSESSIONID');
  });

  it('non promette che il connettore funzioni senza cookie', () => {
    expect(readme).not.toContain('funziona comunque');
  });

  it('dice come estrarre il cookie (scheda Network)', () => {
    expect(readme).toContain('Network');
  });

  it('dichiara il blocco per IP del deployment', () => {
    expect(readme).toContain('datacenter');
  });
});

describe('README — cosa succede senza cookie', () => {
  it('dice a quale tool si riferisce la forma della risposta', () => {
    expect(paragrafoSenzaCookie).toContain('cassazione_search_massime');
    expect(paragrafoSenzaCookie).toContain('cassazione_get_sentenza');
  });

  it('distingue la risposta di cassazione_get_sentenza (nessun totale, due soli link)', () => {
    expect(paragrafoSenzaCookie).toContain('urlItalgiure');
    expect(paragrafoSenzaCookie).toContain('urlSentenzeWeb');
  });

  it('dichiara che il link ECLI è condizionato alla query', () => {
    expect(paragrafoSenzaCookie).toContain('urlEcli');
    expect(paragrafoSenzaCookie).toContain('è presente solo');
  });
});

describe('README — copertura dell\'indice pubblico', () => {
  it('dice che l\'indice pubblico è gratuito e copre le sentenze dal 2012 in poi', () => {
    expect(sezioneCookie).toContain('2012');
    expect(sezioneCookie).toContain('gratuito');
  });

  it('dice che massime complete e sentenze precedenti al 2012 richiedono autenticazione', () => {
    expect(sezioneCookie).toContain('richiedono autenticazione');
  });

  it('non contraddice il canale lato client', () => {
    expect(sezioneCookie).toContain('stesso indice pubblico');
  });
});
