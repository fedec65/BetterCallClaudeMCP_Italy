import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildSolrQuery,
  calculateStart,
  buildPdfUrl,
  getItalgiureCookie,
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

    it('prioritizes explicit cookie over env var', () => {
      process.env.ITALGIURE_COOKIE = 'env-cookie';
      expect(getItalgiureCookie('explicit-cookie')).toBe('explicit-cookie');
    });

    it('trims explicit cookie value', () => {
      expect(getItalgiureCookie('  explicit-cookie  ')).toBe('explicit-cookie');
    });
  });
});
