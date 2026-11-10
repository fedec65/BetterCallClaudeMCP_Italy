import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * La guida di setup è il primo documento che legge chi installa il server:
 * se contraddice i messaggi dei tool, l'utente cerca un cookie che non
 * esiste o pensa che il connettore funzioni senza.
 */
const readme = readFileSync(resolve(__dirname, '..', '..', '..', '..', 'README.md'), 'utf8');

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
