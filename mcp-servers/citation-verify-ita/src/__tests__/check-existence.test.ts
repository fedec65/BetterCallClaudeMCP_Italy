import { describe, it, expect, vi } from 'vitest';
import { checkExistence, normalizeCitazione } from '../tools/check-existence.js';

// Mock delle fonti dati (nessuna rete nei test)
vi.mock('@bettercallclaude-italia/cassazione/italgiure-client', () => ({
  searchItalgiure: vi.fn(),
}));
vi.mock('@bettercallclaude-italia/normattiva/search-advanced', () => ({
  searchNormattivaAdvanced: vi.fn(),
}));

import { searchItalgiure } from '@bettercallclaude-italia/cassazione/italgiure-client';
import { searchNormattivaAdvanced } from '@bettercallclaude-italia/normattiva/search-advanced';

const mockedSearchItalgiure = vi.mocked(searchItalgiure);
const mockedSearchNormattiva = vi.mocked(searchNormattivaAdvanced);

describe('normalizeCitazione', () => {
  it('parses Cassazione with n. numero/anno', () => {
    const r = normalizeCitazione('Cass. n. 12345/2024');
    expect(r.kind).toBe('sentenza_cassazione');
    expect(r.numero).toBe('12345');
    expect(r.anno).toBe(2024);
  });

  it('parses Cassazione with sezione and "del"', () => {
    const r = normalizeCitazione('Cassazione civile Sez. 3, n. 32127 del 2024');
    expect(r.kind).toBe('sentenza_cassazione');
    expect(r.numero).toBe('32127');
    expect(r.anno).toBe(2024);
    expect(r.sezione).toBe('3');
  });

  it('parses D.Lgs. with slash notation', () => {
    const r = normalizeCitazione('D.Lgs. 231/2001');
    expect(r.kind).toBe('atto_normativo');
    expect(r.denominazioneAtto).toBe('DECRETO LEGISLATIVO');
    expect(r.numeroAtto).toBe('231');
    expect(r.annoAtto).toBe(2001);
  });

  it('parses Legge with date form', () => {
    const r = normalizeCitazione('Legge 24 agosto 2017, n. 123');
    expect(r.kind).toBe('atto_normativo');
    expect(r.denominazioneAtto).toBe('LEGGE');
    expect(r.numeroAtto).toBe('123');
    expect(r.annoAtto).toBe(2017);
  });

  it('maps c.c. to Codice civile (R.D. 262/1942) with articolo', () => {
    const r = normalizeCitazione('art. 1456 c.c.');
    expect(r.kind).toBe('atto_normativo');
    expect(r.codiceEsteso).toBe('Codice civile');
    expect(r.numeroAtto).toBe('262');
    expect(r.annoAtto).toBe(1942);
    expect(r.articolo).toBe('1456');
  });

  it('maps c.p.c. to Codice di procedura civile (R.D. 1443/1940)', () => {
    const r = normalizeCitazione('art. 360 c.p.c.');
    expect(r.codiceEsteso).toBe('Codice di procedura civile');
    expect(r.numeroAtto).toBe('1443');
    expect(r.annoAtto).toBe(1940);
    expect(r.articolo).toBe('360');
  });

  it('maps Cost. to Costituzione', () => {
    const r = normalizeCitazione('art. 24 Cost.');
    expect(r.kind).toBe('atto_normativo');
    expect(r.codiceEsteso).toBe('Costituzione della Repubblica italiana');
    expect(r.articolo).toBe('24');
  });

  it('returns non_riconosciuta for garbage', () => {
    expect(normalizeCitazione('qwerty asdf').kind).toBe('non_riconosciuta');
  });

  it('returns non_riconosciuta for Cassazione without number', () => {
    expect(normalizeCitazione('Cassazione civile').kind).toBe('non_riconosciuta');
  });
});

describe('checkExistence', () => {
  it('returns not-recognized for garbage input', async () => {
    const r = await checkExistence({ citazione: 'xyz qwerty' });
    expect(r.exists).toBe(false);
    expect(r.fonte).toBeNull();
    expect(r.note[0]).toContain('non riconosciuta');
  });

  it('throws SOURCE_UNAVAILABLE when ItalGiure cookie is missing', async () => {
    mockedSearchItalgiure.mockResolvedValue({
      success: false,
      cookieValido: false,
      totale: 0,
      massime: [],
      fallback: {
        urlRicerca: '',
        urlItalgiure: '',
        urlGoogle: '',
        urlDuckDuckGo: '',
        istruzioni: 'Cookie non configurato',
      },
    } as never);

    await expect(checkExistence({ citazione: 'Cass. n. 12345/2024' }))
      .rejects.toThrow('SOURCE_UNAVAILABLE');
  });

  it('returns exists=true when ItalGiure finds the sentenza', async () => {
    mockedSearchItalgiure.mockResolvedValue({
      success: true,
      cookieValido: true,
      totale: 1,
      start: 0,
      massime: [{
        id: 'snciv2024332127S',
        estremi: 'Sez. 3 Sentenza n. 32127 del 2024',
        sezione: '3',
        tipo: 'Sentenza',
        dataDecisione: '20241106',
        urlPdf: 'https://www.italgiure.giustizia.it/sncass/20241212/snciv@s30@a2024@n32127@tS.pdf',
      }],
    } as never);

    const r = await checkExistence({ citazione: 'Cass. n. 32127/2024', italgiure_cookie: 'X=Y' });
    expect(r.exists).toBe(true);
    expect(r.fonte).toBe('cassazione');
    expect(r.riferimento_normalizzato?.numero).toBe('32127');
    expect(r.riferimento_normalizzato?.anno).toBe(2024);
    expect(mockedSearchItalgiure).toHaveBeenCalledWith(expect.objectContaining({
      query: 'numdec:"32127"',
      anno: 2024,
      cookie: 'X=Y',
    }));
  });

  it('returns exists=false when ItalGiure finds nothing', async () => {
    mockedSearchItalgiure.mockResolvedValue({
      success: true,
      cookieValido: true,
      totale: 0,
      start: 0,
      massime: [],
    } as never);

    const r = await checkExistence({ citazione: 'Cass. n. 999999/1999' });
    expect(r.exists).toBe(false);
    expect(r.fonte).toBe('cassazione');
    expect(r.note[0]).toContain('Nessuna sentenza');
  });

  it('returns exists=true when Normattiva finds the atto', async () => {
    mockedSearchNormattiva.mockResolvedValue({
      atti: [{
        codiceRedazionale: '001G0251',
        dataGU: '2001-06-19',
        numeroGU: '140',
        titoloAtto: 'Decreto legislativo 8 giugno 2001, n. 231',
        denominazioneAtto: 'DECRETO LEGISLATIVO',
        numeroAtto: '231',
        annoProvvedimento: 2001,
        urlNormattiva: 'https://www.normattiva.it/eli/id/2001/06/19/001G0251',
      }],
      totali: 1,
      pagina: 1,
      pageSize: 5,
    });

    const r = await checkExistence({ citazione: 'D.Lgs. 231/2001' });
    expect(r.exists).toBe(true);
    expect(r.fonte).toBe('normattiva');
    expect(r.riferimento_normalizzato?.codiceRedazionale).toBe('001G0251');
  });

  it('returns exists=false when Normattiva finds nothing', async () => {
    mockedSearchNormattiva.mockResolvedValue({
      atti: [],
      totali: 0,
      pagina: 1,
      pageSize: 5,
    });

    const r = await checkExistence({ citazione: 'D.Lgs. 999/1800' });
    expect(r.exists).toBe(false);
    expect(r.fonte).toBe('normattiva');
  });

  it('throws SOURCE_UNAVAILABLE when Normattiva is down', async () => {
    mockedSearchNormattiva.mockRejectedValue(new Error('[normattiva] API_UNAVAILABLE'));

    await expect(checkExistence({ citazione: 'D.Lgs. 231/2001' }))
      .rejects.toThrow('SOURCE_UNAVAILABLE');
  });

  it('verifies Costituzione without HTTP call', async () => {
    mockedSearchNormattiva.mockClear();
    const r = await checkExistence({ citazione: 'art. 24 Cost.' });
    expect(r.exists).toBe(true);
    expect(r.fonte).toBe('normattiva');
    expect(r.riferimento_normalizzato?.articolo).toBe('24');
    expect(mockedSearchNormattiva).not.toHaveBeenCalled();
  });
});
