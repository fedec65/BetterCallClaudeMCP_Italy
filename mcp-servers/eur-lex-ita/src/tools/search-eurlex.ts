import { fetchWithRetry, parseApiError } from '@bettercallclaude-italia/shared';
import type { SearchEurLexInput } from '../types.js';

const SPARQL_ENDPOINT = 'https://publications.europa.eu/webapi/rdf/sparql';

const TYPE_MAP: Record<string, string> = {
  REG: 'http://publications.europa.eu/resource/authority/resource-type/REG',
  DIR: 'http://publications.europa.eu/resource/authority/resource-type/DIR',
  DIR_IMPL: 'http://publications.europa.eu/resource/authority/resource-type/DIR_IMPL',
  DEC: 'http://publications.europa.eu/resource/authority/resource-type/DEC',
  REC: 'http://publications.europa.eu/resource/authority/resource-type/REC',
};

function escapeSparqlString(str: string): string {
  return str.replace(/["\\]/g, '\\$&');
}

function buildSparqlQuery(input: SearchEurLexInput): string {
  const limit = input.pageSize ?? 20;
  const offset = ((input.page ?? 1) - 1) * limit;

  const triples: string[] = [];
  const filters: string[] = [];

  // Work and CELEX
  if (input.celex) {
    triples.push(`?work cdm:resource_legal_id_celex "${escapeSparqlString(input.celex)}"^^xsd:string .`);
    triples.push(`BIND("${escapeSparqlString(input.celex)}" AS ?celex)`);
  } else {
    triples.push(`?work cdm:resource_legal_id_celex ?celex .`);
  }

  // Resource type
  if (input.tipoAtto && input.tipoAtto !== 'ANY') {
    triples.push(`?work cdm:work_has_resource-type <${TYPE_MAP[input.tipoAtto]}> .`);
  } else if (!input.celex) {
    triples.push(`?work cdm:work_has_resource-type ?rtype .`);
    triples.push(`FILTER (?rtype IN (<http://publications.europa.eu/resource/authority/resource-type/REG>, <http://publications.europa.eu/resource/authority/resource-type/DIR>, <http://publications.europa.eu/resource/authority/resource-type/DIR_IMPL>, <http://publications.europa.eu/resource/authority/resource-type/DEC>, <http://publications.europa.eu/resource/authority/resource-type/REC>))`);
  }

  // Date
  triples.push(`?work cdm:work_date_document ?date .`);

  if (input.anno) {
    filters.push(`FILTER (YEAR(?date) = ${input.anno})`);
  }

  if (input.dataInizio) {
    filters.push(`FILTER (?date >= "${input.dataInizio}"^^xsd:date)`);
  }

  if (input.dataFine) {
    filters.push(`FILTER (?date <= "${input.dataFine}"^^xsd:date)`);
  }

  // Number (for regulations/directives/decisions)
  if (input.numero) {
    triples.push(`?work cdm:resource_legal_number ?numero .`);
    filters.push(`FILTER (STR(?numero) = "${escapeSparqlString(input.numero)}")`);
  }

  // Italian expression (title)
  triples.push(`?work cdm:work_has_expression ?exprIt .`);
  triples.push(`?exprIt cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ITA> .`);
  triples.push(`?exprIt cdm:expression_title ?titleIt .`);

  // English fallback
  triples.push(`OPTIONAL {`);
  triples.push(`  ?work cdm:work_has_expression ?exprEn .`);
  triples.push(`  ?exprEn cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .`);
  triples.push(`  ?exprEn cdm:expression_title ?titleEn .`);
  triples.push(`}`);

  triples.push(`BIND(COALESCE(?titleIt, ?titleEn, "(titolo non disponibile)") AS ?title)`);

  // Resource type label
  triples.push(`OPTIONAL {`);
  triples.push(`  ?work cdm:work_has_resource-type ?rtype .`);
  triples.push(`  ?rtype <http://www.w3.org/2004/02/skos/core#prefLabel> ?rtypeLabel .`);
  triples.push(`  FILTER (LANG(?rtypeLabel) = "it" || LANG(?rtypeLabel) = "en")`);
  triples.push(`}`);

  // EuroVoc / subject matter
  if (input.materia) {
    const mat = input.materia.toLowerCase();
    triples.push(`OPTIONAL {`);
    triples.push(`  ?work cdm:work_is_about_concept_eurovoc ?eurovoc .`);
    triples.push(`  ?eurovoc <http://www.w3.org/2004/02/skos/core#prefLabel> ?eurovocLabel .`);
    triples.push(`  FILTER (LANG(?eurovocLabel) = "it" || LANG(?eurovocLabel) = "en")`);
    triples.push(`}`);
    filters.push(`FILTER (CONTAINS(LCASE(STR(COALESCE(?titleIt, ""))), "${escapeSparqlString(mat)}") || CONTAINS(LCASE(STR(COALESCE(?eurovocLabel, ""))), "${escapeSparqlString(mat)}"))`);
  }

  // Keyword filter
  if (input.query && !input.materia) {
    const kw = input.query.toLowerCase();
    filters.push(`FILTER (CONTAINS(LCASE(STR(?titleIt)), "${escapeSparqlString(kw)}") || CONTAINS(LCASE(STR(COALESCE(?titleEn, ""))), "${escapeSparqlString(kw)}"))`);
  }

  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT DISTINCT ?celex ?title ?date ?rtypeLabel
WHERE {
  ${triples.join('\n  ')}
  ${filters.length ? filters.join('\n  ') : ''}
}
ORDER BY DESC(?date)
LIMIT ${limit}
OFFSET ${offset}`;
}

export async function searchEurLex(input: SearchEurLexInput): Promise<{
  atti: Array<{
    celex: string;
    title: string;
    date: string;
    tipo?: string;
    url?: string;
  }>;
  totali: number;
  query: string;
}> {
  const query = buildSparqlQuery(input);

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

    return {
      atti: bindings.map((b: Record<string, { value: string } | undefined>) => ({
        celex: b.celex?.value ?? '',
        title: b.title?.value ?? '(titolo non disponibile)',
        date: b.date?.value ?? '',
        tipo: b.rtypeLabel?.value ?? '',
        url: b.celex?.value
          ? `https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:${b.celex.value}`
          : undefined,
      })),
      totali: bindings.length,
      query,
    };
  } catch (error) {
    const parsed = parseApiError(error);
    throw new Error(`[eur-lex-ita_search] ${parsed.code}: ${parsed.message}`);
  }
}
