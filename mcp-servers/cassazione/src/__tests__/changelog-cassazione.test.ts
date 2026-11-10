import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Il changelog dichiara ai lettori cosa è cambiato: se una voce descrive un
 * comportamento che il codice non ha, il lettore si fida di una promessa
 * falsa. Qui si verifica che le voci sul server cassazione corrispondano a
 * quello che il codice fa.
 */
const changelog = readFileSync(resolve(__dirname, '..', '..', '..', '..', 'CHANGELOG.md'), 'utf8');

const sezioneUnreleased = changelog.slice(
  changelog.indexOf('## [Unreleased]'),
  changelog.indexOf('## [1.2.0]')
);

describe('CHANGELOG — voce sul server cassazione', () => {
  it('documenta che la descrizione promette autenticazione.messaggio solo se la ricerca non è eseguibile', () => {
    expect(sezioneUnreleased).toContain('autenticazione.messaggio');
    expect(sezioneUnreleased).toContain('non è eseguibile');
  });

  it('non afferma che tutti i messaggi di fallback rimandano al canale lato client', () => {
    expect(sezioneUnreleased).not.toContain(
      'indicano la causa reale e rimandano al canale lato client'
    );
  });

  it('distingue i rami che rimandano al canale lato client da quelli che no', () => {
    expect(sezioneUnreleased).toContain('canale lato client');
    expect(sezioneUnreleased).toContain('procedura di rinnovo');
    expect(sezioneUnreleased).toContain('status HTTP');
  });

  it('non etichetta il ramo 401/403 come "cookie scaduto"', () => {
    // Il 403 non dichiara la scadenza della sessione: il CHANGELOG non può
    // farlo.
    expect(sezioneUnreleased).not.toContain('per il cookie scaduto');
    expect(sezioneUnreleased).toContain('sessione rifiutata dal servizio');
  });
});
