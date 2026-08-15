# Guida Integrazione API

## Normattiva Open Data API

**Base URL**: `https://api.normattiva.it/t/normattiva.api`

### Ricerca Semplice
```http
POST /bff-opendata/v1/api/v1/ricerca/semplice
Content-Type: application/json

{
  "testoRicerca": "privacy",
  "orderType": "recente",
  "paginazione": {
    "paginaCorrente": 1,
    "numeroElementiPerPagina": 20
  }
}
```

### Ricerca Avanzata
```http
POST /bff-opendata/v1/api/v1/ricerca/avanzata
Content-Type: application/json

{
  "denominazioneAtto": "DECRETO LEGISLATIVO",
  "annoProvvedimento": 2023,
  "orderType": "recente",
  "paginazione": { "paginaCorrente": 1, "numeroElementiPerPagina": 10 }
}
```

### Tipologiche
```http
GET /bff-opendata/v1/api/v1/tipologiche/classe-provvedimento
GET /bff-opendata/v1/api/v1/tipologiche/denominazione-atto
GET /bff-opendata/v1/api/v1/tipologiche/estensioni
```

**Nota**: L'endpoint `/bff-mobile/v1/api/v1/atto/dettaglio-atto` è protetto da WAF. Il dettaglio atto viene recuperato tramite ricerca avanzata con filtri precisi.

## EUR-Lex CELLAR SPARQL

**Endpoint**: `https://publications.europa.eu/webapi/rdf/sparql`

### Esempio query per Regolamenti recenti in italiano
```sparql
PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?celex ?title ?date
WHERE {
  ?work cdm:work_has_resource-type <http://publications.europa.eu/resource/authority/resource-type/REG> .
  ?work cdm:resource_legal_id_celex ?celex .
  ?work cdm:work_date_document ?date .
  OPTIONAL {
    ?exprIt cdm:expression_belongs_to_work ?work .
    ?exprIt cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ITA> .
    ?exprIt cdm:expression_title ?titleIt .
  }
  OPTIONAL {
    ?exprEn cdm:expression_belongs_to_work ?work .
    ?exprEn cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
    ?exprEn cdm:expression_title ?titleEn .
  }
  BIND(COALESCE(?titleIt, ?titleEn) AS ?title)
}
ORDER BY DESC(?date)
LIMIT 20
```

**Rate limits**: Timeout 60s, max 5 connessioni concorrenti. Usare sempre `LIMIT` e `OFFSET`.

## Corte Costituzionale

**Portale**: `https://www.cortecostituzionale.it`

**Endpoint ricerca**: `https://www.cortecostituzionale.it/actionPronuncia.do`

Parametri URL:
- `anno`: anno sentenza
- `numero`: numero sentenza

**Open Data**: `https://dati.cortecostituzionale.it` — dataset scaricabili in CSV/JSON/XML (non API live).

## Giustizia Amministrativa

**Portale**: `https://www.giustizia-amministrativa.it`

**Ricerca provvedimenti**: `https://www.giustizia-amministrativa.it/cdsintra/cdsintra/AmministrazionePortale/Ricerca/index.html?tipoRicerca=Provvedimenti`

Nessuna API pubblica documentata. Accesso tramite web scraping.

## Corte di Cassazione

**Portale pubblico**: `https://www.cortedicassazione.it/corte-di-cassazione/it/sentenzeW.html`

**Accesso completo**: `https://www.italgiure.giustizia.it` (riservato operatori giuridici)

## Rate Limiting

Ogni server utilizza `bottleneck` con configurazioni dedicate:

| API | minTime | maxConcurrent |
|---|---|---|
| normattiva | 1000ms | 2 |
| eurlex | 1500ms | 2 |
| cortecostituzionale | 1500ms | 2 |
| giustiziaamministrativa | 1500ms | 2 |
| cassazione | 2000ms | 1 |

Retry: `p-retry` con 3 tentativi, backoff esponenziale.
