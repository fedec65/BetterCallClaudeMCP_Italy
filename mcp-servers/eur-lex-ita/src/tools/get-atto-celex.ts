import { fetchWithRetry, parseApiError } from '@bettercallclaude-italia/shared';
import type { GetAttoCelexInput } from '../types.js';

const SPARQL_ENDPOINT = 'https://publications.europa.eu/webapi/rdf/sparql';

export async function getAttoCelex(input: GetAttoCelexInput): Promise<{
  celex: string;
  title: string;
  date?: string;
  tipo?: string;
  numero?: string;
  urlIta?: string;
  urlEng?: string;
}> {
  const query = `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?titleIt ?titleEn ?date ?rtypeLabel ?numero
WHERE {
  ?work cdm:resource_legal_id_celex "${input.celex}"^^xsd:string .
  OPTIONAL { ?work cdm:work_date_document ?date . }
  OPTIONAL { ?work cdm:resource_legal_number ?numero . }
  OPTIONAL {
    ?work cdm:work_has_expression ?exprIt .
    ?exprIt cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ITA> .
    ?exprIt cdm:expression_title ?titleIt .
  }
  OPTIONAL {
    ?work cdm:work_has_expression ?exprEn .
    ?exprEn cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
    ?exprEn cdm:expression_title ?titleEn .
  }
  OPTIONAL {
    ?work cdm:work_has_resource-type ?rtype .
    ?rtype <http://www.w3.org/2004/02/skos/core#prefLabel> ?rtypeLabel .
    FILTER (LANG(?rtypeLabel) = "it" || LANG(?rtypeLabel) = "en")
  }
}
LIMIT 1`;

  try {
    const response = (await fetchWithRetry(
      'eurlex',
      () =>
        fetch(SPARQL_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/sparql-results+json',
          },
          body: new URLSearchParams({ query }),
        }).then(async (res) => {
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`HTTP ${res.status}: ${text}`);
          }
          return res.json() as Promise<{
            results?: { bindings?: Array<Record<string, { value: string }>> };
          }>;
        }),
      { retries: 3 }
    ));

    const bindings = response.results?.bindings ?? [];
    const b = bindings[0];

    if (!b) {
      return {
        celex: input.celex,
        title: 'Atto non trovato',
        urlIta: `https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:${input.celex}`,
        urlEng: `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${input.celex}`,
      };
    }

    return {
      celex: input.celex,
      title: b.titleIt?.value ?? b.titleEn?.value ?? '(titolo non disponibile)',
      date: b.date?.value,
      tipo: b.rtypeLabel?.value,
      numero: b.numero?.value,
      urlIta: `https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:${input.celex}`,
      urlEng: `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${input.celex}`,
    };
  } catch (error) {
    const parsed = parseApiError(error);
    throw new Error(`[eur-lex-ita_get_atto_celex] ${parsed.code}: ${parsed.message}`);
  }
}
