import { getSentenzaItalgiure } from './italgiure-client.js';
import type { GetSentenzaInput } from '../types.js';

/**
 * Retrieve a single Cassation Court decision via ItalGiure Solr API.
 *
 * Requires an active ItalGiure session cookie (ITALGIURE_COOKIE env var
 * or italgiure_cookie.txt file). When the cookie is missing or expired,
 * the tool returns structured fallback information.
 */
export async function getSentenzaCassazione(input: GetSentenzaInput): Promise<{
  id: string;
  estremi?: string;
  sezione?: string;
  tipo?: string;
  dataDecisione?: string;
  dataDeposito?: string;
  urlPdf?: string;
  autenticazione: {
    cookieValido: boolean;
    messaggio?: string;
  };
  fallback?: {
    urlItalgiure: string;
    urlSentenzeWeb: string;
    istruzioni: string;
  };
}> {
  const result = await getSentenzaItalgiure(input.id);

  if (result.success) {
    return {
      ...result.sentenza,
      autenticazione: { cookieValido: true },
    };
  }

  return {
    id: input.id,
    autenticazione: {
      cookieValido: false,
      messaggio: result.fallback.istruzioni,
    },
    fallback: result.fallback,
  };
}
