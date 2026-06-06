import { searchItalgiure } from './italgiure-client.js';
import type { SearchMassimeInput } from '../types.js';

/**
 * Search Cassation Court decisions via ItalGiure Solr API.
 *
 * Requires an active ItalGiure session cookie (ITALGIURE_COOKIE env var
 * or italgiure_cookie.txt file). When the cookie is missing or expired,
 * the tool returns structured fallback URLs for manual consultation.
 */
export async function searchMassime(input: SearchMassimeInput): Promise<{
  massime: Array<{
    id?: string;
    estremi?: string;
    sezione?: string;
    tipo?: string;
    dataDecisione?: string;
    dataDeposito?: string;
    urlPdf?: string;
  }>;
  totale: number;
  autenticazione: {
    cookieValido: boolean;
    messaggio?: string;
  };
  fallback?: {
    urlRicerca: string;
    urlItalgiure: string;
    urlSentenzeWeb: string;
    urlEcli?: string;
    urlGoogle: string;
    urlDuckDuckGo: string;
    istruzioni: string;
  };
}> {
  const result = await searchItalgiure(input);

  if (result.success) {
    return {
      massime: result.massime,
      totale: result.totale,
      autenticazione: { cookieValido: true },
    };
  }

  return {
    massime: [],
    totale: 0,
    autenticazione: {
      cookieValido: false,
      messaggio: result.fallback.istruzioni,
    },
    fallback: result.fallback,
  };
}
