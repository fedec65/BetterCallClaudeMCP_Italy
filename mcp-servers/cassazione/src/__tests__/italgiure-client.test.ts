import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';
import {
  buildSolrQuery,
  calculateStart,
  buildPdfUrl,
  getItalgiureCookie,
  searchItalgiure,
  getSentenzaItalgiure,
  classificaFallimentoItalgiure,
  statusHttpErrore,
  ITALGIURE_BLOCKED_MESSAGE,
  ITALGIURE_COOKIE_PROCEDURE,
  ITALGIURE_MISSING_COOKIE_MESSAGE,
} from '../tools/italgiure-client.js';
import type { SearchMassimeInput } from '../types.js';

describe('italgiure-client', () => {
  describe('buildSolrQuery', () => {
    it('builds simple free-text query', () => {
      const input: SearchMassimeInput = { query: 'responsabilita medica' };
      const q = buildSolrQuery(input);
      expect(q).toBe('(responsabilita medica)');
    });

    it('escapes special Solr characters', () => {
      const input: SearchMassimeInput = { query: 'test (special) [chars]' };
      const q = buildSolrQuery(input);
      expect(q).toContain('\\(');
      expect(q).toContain('\\)');
    });

    it('uses raw query when Solr syntax is detected', () => {
      const input: SearchMassimeInput = { query: '(foo AND bar) OR baz:qux~7' };
      const q = buildSolrQuery(input);
      expect(q).toBe('(foo AND bar) OR baz:qux~7');
    });

    it('adds kind filter for civile', () => {
      const input: SearchMassimeInput = { query: 'danno', materia: 'civile' };
      const q = buildSolrQuery(input);
      expect(q).toBe('(danno) AND kind:"snciv"');
    });

    it('adds kind filter for penale', () => {
      const input: SearchMassimeInput = { query: 'omicidio', materia: 'penale' };
      const q = buildSolrQuery(input);
      expect(q).toBe('(omicidio) AND kind:"snpen"');
    });

    it('adds anno filter', () => {
      const input: SearchMassimeInput = { query: 'furto', anno: 2023 };
      const q = buildSolrQuery(input);
      expect(q).toBe('(furto) AND anno:"2023"');
    });

    it('adds tipo filter capitalized', () => {
      const input: SearchMassimeInput = { query: 'danno', tipo: 'sentenza' };
      const q = buildSolrQuery(input);
      expect(q).toBe('(danno) AND tipoprov:"Sentenza"');
    });

    it('combines all filters', () => {
      const input: SearchMassimeInput = { query: 'danno', materia: 'civile', anno: 2024, tipo: 'ordinanza' };
      const q = buildSolrQuery(input);
      expect(q).toBe('(danno) AND kind:"snciv" AND anno:"2024" AND tipoprov:"Ordinanza"');
    });
  });

  describe('calculateStart', () => {
    it('returns 0 for first page defaults', () => {
      expect(calculateStart()).toBe(0);
    });

    it('calculates offset for page 3 size 10', () => {
      expect(calculateStart(3, 10)).toBe(20);
    });
  });

  describe('buildPdfUrl', () => {
    it('strips leading ./ from filename', () => {
      const url = buildPdfUrl('./20241212/snciv@s30@a2024@n32127@tS.pdf');
      expect(url).toBe('https://www.italgiure.giustizia.it/sncass/20241212/snciv@s30@a2024@n32127@tS.pdf');
    });

    it('works without leading ./', () => {
      const url = buildPdfUrl('foo/bar.pdf');
      expect(url).toBe('https://www.italgiure.giustizia.it/sncass/foo/bar.pdf');
    });
  });

  describe('getItalgiureCookie', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.ITALGIURE_COOKIE;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('reads from env var', () => {
      process.env.ITALGIURE_COOKIE = 'ASPSESSIONID=abc123';
      expect(getItalgiureCookie()).toBe('ASPSESSIONID=abc123');
    });

    it('returns undefined when not configured', () => {
      expect(getItalgiureCookie()).toBeUndefined();
    });

    it('trims env var value', () => {
      process.env.ITALGIURE_COOKIE = '  cookie-value  ';
      expect(getItalgiureCookie()).toBe('cookie-value');
    });
  });
});

describe('messaggi di fallback', () => {
  it('non suggerisce document.cookie', () => {
    expect(ITALGIURE_COOKIE_PROCEDURE).not.toContain('document.cookie');
  });

  it('spiega che il cookie si prende dalla scheda Network', () => {
    expect(ITALGIURE_COOKIE_PROCEDURE).toContain('Network');
  });

  it('nomina il blocco per IP del datacenter', () => {
    expect(ITALGIURE_BLOCKED_MESSAGE).toContain('datacenter');
  });

  it('non promette SentenzeWeb come alternativa per il server', () => {
    expect(ITALGIURE_BLOCKED_MESSAGE).not.toContain('Alternativa gratuita');
  });

  it('rimanda al canale client-side', () => {
    expect(ITALGIURE_BLOCKED_MESSAGE).toContain('italgiure-search');
  });

  it('copre sia il timeout sia la connessione non riuscita', () => {
    expect(ITALGIURE_BLOCKED_MESSAGE).toContain('timeout');
    expect(ITALGIURE_BLOCKED_MESSAGE).toContain('connessione non riuscita');
  });
});

describe('messaggi del ramo senza cookie', () => {
  it('dichiara che nessuna richiesta è stata inviata', () => {
    expect(ITALGIURE_MISSING_COOKIE_MESSAGE).toContain('nessuna richiesta');
  });

  it('non dichiara il blocco per IP: in questo ramo non è stata osservata alcuna connessione', () => {
    expect(ITALGIURE_MISSING_COOKIE_MESSAGE).not.toContain('datacenter');
  });

  it('rimanda al canale client', () => {
    expect(ITALGIURE_MISSING_COOKIE_MESSAGE).toContain('italgiure-search');
  });
});

describe('classificaFallimentoItalgiure', () => {
  it('classifica il timeout come fallimento di trasporto', () => {
    const r = classificaFallimentoItalgiure('API_TIMEOUT', 'Timeout nella richiesta all\'API.');
    expect(r.tipo).toBe('trasporto');
    expect(r.messaggio).toBe(ITALGIURE_BLOCKED_MESSAGE);
  });

  it('classifica l\'indisponibilità del servizio come fallimento di trasporto', () => {
    expect(classificaFallimentoItalgiure('API_UNAVAILABLE', 'Servizio non disponibile').tipo).toBe('trasporto');
  });

  it('classifica 401 e 403 come problema di cookie', () => {
    expect(classificaFallimentoItalgiure('API_ERROR', 'Request failed with status code 401').tipo).toBe('cookie');
    expect(classificaFallimentoItalgiure('API_ERROR', 'Request failed with status code 403').tipo).toBe('cookie');
  });

  it('non dichiara il blocco per IP su un errore HTTP non di trasporto', () => {
    const r = classificaFallimentoItalgiure('API_ERROR', 'Request failed with status code 500');
    expect(r.tipo).toBe('errore');
    expect(r.messaggio).not.toContain('datacenter');
  });

  it('non dichiara il blocco per IP su un rate limit', () => {
    const r = classificaFallimentoItalgiure('RATE_LIMIT_EXCEEDED', 'Limite di richieste superato.');
    expect(r.tipo).toBe('errore');
    expect(r.messaggio).not.toContain('datacenter');
  });

  it('classifica un errore HTTP 500 come errore del servizio, non come fallimento di trasporto', () => {
    const r = classificaFallimentoItalgiure(
      'API_UNAVAILABLE',
      'Servizio non disponibile: Internal Server Error',
      500
    );
    expect(r.tipo).toBe('errore');
    expect(r.messaggio).toContain('500');
    expect(r.messaggio).not.toContain('datacenter');
  });

  it('classifica l\'indisponibilità senza risposta HTTP come fallimento di trasporto', () => {
    const r = classificaFallimentoItalgiure('API_UNAVAILABLE', 'Servizio non disponibile', undefined);
    expect(r.tipo).toBe('trasporto');
    expect(r.messaggio).toBe(ITALGIURE_BLOCKED_MESSAGE);
  });

  it('classifica 401 con status HTTP come problema di cookie', () => {
    const r = classificaFallimentoItalgiure('API_ERROR', 'Request failed with status code 401', 401);
    expect(r.tipo).toBe('cookie');
  });

  it('non accumula due punti finali quando il messaggio originale li ha già', () => {
    const r = classificaFallimentoItalgiure(
      'RATE_LIMIT_EXCEEDED',
      'Limite di richieste superato. Riprova più tardi.'
    );
    expect(r.messaggio).not.toMatch(/\.\.$/);
    expect(r.messaggio).toContain('Limite di richieste superato');
  });

  it('chiude con un punto quando il messaggio originale non lo ha', () => {
    const r = classificaFallimentoItalgiure('INTERNAL_ERROR', 'Errore sconosciuto');
    expect(r.messaggio).toBe('Errore ItalGiure: Errore sconosciuto.');
  });
});

describe('statusHttpErrore', () => {
  it('legge lo status dalla risposta dell\'errore axios', () => {
    expect(statusHttpErrore({ response: { status: 500 } })).toBe(500);
  });

  it('restituisce undefined per un errore senza risposta HTTP', () => {
    expect(statusHttpErrore({ message: 'timeout of 30000ms exceeded' })).toBeUndefined();
  });

  it('restituisce undefined per un errore non axios', () => {
    expect(statusHttpErrore(new Error('boom'))).toBeUndefined();
  });
});

describe('rami senza cookie (nessuna richiesta inviata)', () => {
  const originalEnv = process.env;
  const cookieFile = resolve(process.cwd(), 'italgiure_cookie.txt');

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ITALGIURE_COOKIE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it.skipIf(existsSync(cookieFile))('searchItalgiure senza cookie non dichiara il blocco per IP', async () => {
    const r = await searchItalgiure({ query: 'responsabilita medica' });
    expect(r.success).toBe(false);
    if (r.success) throw new Error('atteso fallimento');
    expect(r.fallback.istruzioni).not.toContain('datacenter');
    expect(r.fallback.istruzioni).toContain('Network');
  });

  it.skipIf(existsSync(cookieFile))('getSentenzaItalgiure senza cookie non dichiara il blocco per IP', async () => {
    const r = await getSentenzaItalgiure('snciv2024332127S');
    expect(r.success).toBe(false);
    if (r.success || r.cookieValido) throw new Error('atteso il fallback senza cookie');
    expect(r.fallback.istruzioni).not.toContain('datacenter');
    expect(r.fallback.istruzioni).toContain('Network');
  });
});
