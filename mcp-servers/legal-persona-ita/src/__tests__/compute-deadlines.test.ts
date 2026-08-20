import { describe, it, expect } from 'vitest';
import { computeDeadlines, easterDate } from '../tools/compute-deadlines.js';
import { ComputeDeadlinesInputSchema } from '../types.js';

describe('computeDeadlines', () => {
  it('proroga al lunedì una scadenza che cade di domenica (art. 155, co. 4, c.p.c.)', async () => {
    // 2025-01-10 + 30 gg = 2025-02-09 (domenica) → 2025-02-10 (lunedì)
    const result = await computeDeadlines({
      tipo_termine: 'cpc_impugnazione_sentenza_30',
      data_inizio: '2025-01-10',
      lingua: 'it',
    });
    expect(result.data_scadenza).toBe('2025-02-10');
    expect(result.aggiustamento_weekend).toBe(true);
    expect(result.giorni_effettivi).toBe(31);
    expect(result.sospensione_feriale_applicata).toBe(false);
  });

  it('applica la sospensione feriale: scadenza 10 agosto → 10 settembre', async () => {
    // 2025-07-11 + 30 gg = 2025-08-10 → i giorni di agosto non si computano → 2025-09-10
    const result = await computeDeadlines({
      tipo_termine: 'cpc_impugnazione_sentenza_30',
      data_inizio: '2025-07-11',
      lingua: 'it',
    });
    expect(result.data_scadenza).toBe('2025-09-10');
    expect(result.sospensione_feriale_applicata).toBe(true);
    expect(result.giorni_effettivi).toBe(61);
    expect(result.festivita_incontrate).toContain('Ferragosto (15 agosto)');
    expect(result.note.some((n) => n.includes('Sospensione feriale'))).toBe(true);
  });

  it('decorrenza ad agosto: dies a quo effettivo al 1° settembre', async () => {
    // data_inizio 2025-08-15: i giorni di agosto non si contano,
    // il termine di 30 gg decorre dal 1° settembre → 2025-09-30
    const result = await computeDeadlines({
      tipo_termine: 'cpc_impugnazione_sentenza_30',
      data_inizio: '2025-08-15',
      lingua: 'it',
    });
    expect(result.data_scadenza).toBe('2025-09-30');
    expect(result.sospensione_feriale_applicata).toBe(true);
    expect(result.giorni_effettivi).toBe(46);
  });

  it('termine a giorni liberi (reclamo 10 gg): nessuna proroga per scadenza festiva', async () => {
    // 2025-01-30 + 10 gg = 2025-02-09 (domenica) → resta 2025-02-09
    const result = await computeDeadlines({
      tipo_termine: 'cpc_reclamo_10',
      data_inizio: '2025-01-30',
      lingua: 'it',
    });
    expect(result.data_scadenza).toBe('2025-02-09');
    expect(result.aggiustamento_weekend).toBe(false);
    expect(result.note.some((n) => n.includes('giorni liberi'))).toBe(true);
  });

  it('Pasquetta 2025 (21 aprile, mobile): scadenza prorogata al 22 aprile', async () => {
    // 2025-03-22 + 30 gg = 2025-04-21 (Lunedì di Pasqua) → 2025-04-22
    const result = await computeDeadlines({
      tipo_termine: 'cpc_impugnazione_sentenza_30',
      data_inizio: '2025-03-22',
      lingua: 'it',
    });
    expect(result.data_scadenza).toBe('2025-04-22');
    expect(result.aggiustamento_weekend).toBe(true);
    expect(result.festivita_incontrate).toContain('Lunedì di Pasqua (21 aprile)');
  });

  it('Pasquetta 2026 (6 aprile, mobile): scadenza prorogata al 7 aprile', async () => {
    // 2026-03-07 + 30 gg = 2026-04-06 (Lunedì di Pasqua) → 2026-04-07
    const result = await computeDeadlines({
      tipo_termine: 'cpc_impugnazione_sentenza_30',
      data_inizio: '2026-03-07',
      lingua: 'it',
    });
    expect(result.data_scadenza).toBe('2026-04-07');
    expect(result.aggiustamento_weekend).toBe(true);
    expect(result.festivita_incontrate).toContain('Lunedì di Pasqua (6 aprile)');
  });

  it('calcola Pasqua e Pasquetta con l’algoritmo di Gauss', () => {
    expect(easterDate(2025).toISOString().slice(0, 10)).toBe('2025-04-20');
    expect(easterDate(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
  });

  it('i termini penali (cpp_*) non godono della sospensione feriale né della proroga festivi', async () => {
    // 2025-07-11 + 15/30/45 gg = 2025-07-26 (sab) / 2025-08-10 (dom) / 2025-08-25
    const result = await computeDeadlines({
      tipo_termine: 'cpp_cassazione_15_30_45',
      data_inizio: '2025-07-11',
      lingua: 'it',
    });
    expect(result.sospensione_feriale_applicata).toBe(false);
    expect(result.aggiustamento_weekend).toBe(false);
    expect(result.data_scadenza).toBe('2025-08-25');
    expect(result.scadenze).toEqual([
      { giorni: 15, data: '2025-07-26' },
      { giorni: 30, data: '2025-08-10' },
      { giorni: 45, data: '2025-08-25' },
    ]);
  });

  it('disclaimer in inglese con lingua: en', async () => {
    const result = await computeDeadlines({
      tipo_termine: 'cpc_revocazione_30',
      data_inizio: '2025-03-10',
      lingua: 'en',
    });
    expect(result.disclaimer).toBe(
      'Auxiliary computation, not legal advice; always verify the deadline against the case file.',
    );
    expect(result.note.some((n) => n.startsWith('Legal basis'))).toBe(true);
  });

  it('disclaimer italiano di default', async () => {
    const result = await computeDeadlines({
      tipo_termine: 'cpc_revocazione_30',
      data_inizio: '2025-03-10',
      lingua: 'it',
    });
    expect(result.disclaimer).toBe(
      'Computazione ausiliaria, non consulenza legale; verificare sempre la decorrenza con il fascicolo.',
    );
  });

  describe('copertura tabella: un caso per ogni tipo_termine', () => {
    const casi: Array<{
      tipo: Parameters<typeof computeDeadlines>[0]['tipo_termine'];
      scadenza: string;
      scadenze?: Array<{ giorni: number; data: string }>;
    }> = [
      { tipo: 'cpc_impugnazione_sentenza_30', scadenza: '2025-04-09' },
      { tipo: 'cpc_impugnazione_sentenza_60', scadenza: '2025-05-09' },
      { tipo: 'cpc_ricorso_cassazione_60', scadenza: '2025-05-09' },
      { tipo: 'cpc_revocazione_30', scadenza: '2025-04-09' },
      { tipo: 'cpc_reclamo_10', scadenza: '2025-03-20' },
      { tipo: 'cpc_comparsa_risposta_70', scadenza: '2025-05-19' },
      {
        tipo: 'cpc_deposito_183_30_60_80',
        scadenza: '2025-05-29',
        scadenze: [
          { giorni: 30, data: '2025-04-09' },
          { giorni: 60, data: '2025-05-09' },
          { giorni: 80, data: '2025-05-29' },
        ],
      },
      { tipo: 'cpc_memoria_183_15', scadenza: '2025-03-25' },
      {
        tipo: 'cpp_appello_15_30_45',
        scadenza: '2025-04-24',
        scadenze: [
          { giorni: 15, data: '2025-03-25' },
          { giorni: 30, data: '2025-04-09' },
          { giorni: 45, data: '2025-04-24' },
        ],
      },
      {
        tipo: 'cpp_cassazione_15_30_45',
        scadenza: '2025-04-24',
        scadenze: [
          { giorni: 15, data: '2025-03-25' },
          { giorni: 30, data: '2025-04-09' },
          { giorni: 45, data: '2025-04-24' },
        ],
      },
      {
        tipo: 'cpa_ricorso_30_60',
        scadenza: '2025-05-09',
        scadenze: [
          { giorni: 30, data: '2025-04-09' },
          { giorni: 60, data: '2025-05-09' },
        ],
      },
    ];

    for (const { tipo, scadenza, scadenze } of casi) {
      it(`${tipo} da 2025-03-10 → ${scadenza}`, async () => {
        const result = await computeDeadlines({
          tipo_termine: tipo,
          data_inizio: '2025-03-10',
          lingua: 'it',
        });
        expect(result.data_scadenza).toBe(scadenza);
        expect(result.tipo_termine).toBe(tipo);
        expect(result.data_inizio).toBe('2025-03-10');
        expect(result.sospensione_feriale_applicata).toBe(false);
        expect(result.note.length).toBeGreaterThan(0);
        if (scadenze) {
          expect(result.scadenze).toEqual(scadenze);
        } else {
          expect(result.scadenze).toBeUndefined();
        }
      });
    }
  });

  describe('validazione input', () => {
    it('rifiuta data malformata "32/13/2024"', () => {
      expect(() =>
        ComputeDeadlinesInputSchema.parse({
          tipo_termine: 'cpc_impugnazione_sentenza_30',
          data_inizio: '32/13/2024',
        }),
      ).toThrow();
    });

    it('rifiuta data malformata "not-a-date"', () => {
      expect(() =>
        ComputeDeadlinesInputSchema.parse({
          tipo_termine: 'cpc_impugnazione_sentenza_30',
          data_inizio: 'not-a-date',
        }),
      ).toThrow();
    });

    it('rifiuta data inesistente "2024-02-30"', () => {
      expect(() =>
        ComputeDeadlinesInputSchema.parse({
          tipo_termine: 'cpc_impugnazione_sentenza_30',
          data_inizio: '2024-02-30',
        }),
      ).toThrow();
    });

    it('rifiuta tipo_termine sconosciuto', () => {
      expect(() =>
        ComputeDeadlinesInputSchema.parse({
          tipo_termine: 'cpc_inesistente',
          data_inizio: '2025-01-10',
        }),
      ).toThrow();
    });
  });
});
