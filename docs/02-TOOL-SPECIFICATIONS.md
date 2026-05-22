# Specifiche Tool MCP

## normattiva

| Tool | Descrizione |
|---|---|
| `normattiva_search` | Ricerca semplice per parole chiave nel titolo/testo degli atti normativi dal 1861 ad oggi. Parametri: `query`, `orderType`, `page`, `pageSize`, `annoProvvedimento`, `codiceTipoProvvedimento` |
| `normattiva_search_advanced` | Ricerca avanzata con filtri per tipo atto, date di emanazione/pubblicazione, vigenza, classe provvedimento, denominazione atto, numero, anno |
| `normattiva_get_atto` | Recupero metadati atto tramite `codiceRedazionale` e `dataGU`. Restituisce URL al portale Normattiva |
| `normattiva_elenco_tipi` | Elenca tipologie: `classe` (stato atto), `denominazione` (tipo atto), `estensioni` (formati esportazione) |

**Fonte dati**: `https://api.normattiva.it/t/normattiva.api` (API Open Data ufficiale)

## corte-costituzionale

| Tool | Descrizione |
|---|---|
| `corte-costituzionale_search` | Ricerca sentenze per numero, anno, materia, parola chiave |
| `corte-costituzionale_get_sentenza` | Recupero testo integrale per numero e anno |
| `corte-costituzionale_norme_incostituzionali` | Elenco norme dichiarate incostituzionali |

**Fonte dati**: `https://www.cortecostituzionale.it` (portale ufficiale, scraping base)

## giustizia-amministrativa

| Tool | Descrizione |
|---|---|
| `giustizia-amministrativa_search` | Ricerca sentenze TAR e Consiglio di Stato per parola chiave, sezione, organo, date |
| `giustizia-amministrativa_get_sentenza` | Recupero testo integrale per ID sentenza |

**Fonte dati**: `https://www.giustizia-amministrativa.it`

## cassazione

| Tool | Descrizione |
|---|---|
| `cassazione_search_massime` | Ricerca massime Corte di Cassazione (porzione pubblica, ultimi 5 anni) |
| `cassazione_get_sentenza` | Recupero sentenza per ID (porzione pubblica) |

**Fonte dati**: `https://www.cortedicassazione.it` (SentenzeWeb, porzione pubblica)

**Nota**: Accesso completo a massime e sentenze storiche riservato agli operatori giuridici tramite ItalGiure.

## eur-lex-ita

| Tool | Descrizione |
|---|---|
| `eur-lex-ita_search` | Ricerca atti UE in SPARQL CELLAR per tipo, anno, parole chiave, CELEX |
| `eur-lex-ita_get_atto_celex` | Recupero metadati atto UE per codice CELEX |

**Fonte dati**: `https://publications.europa.eu/webapi/rdf/sparql` (SPARQL CELLAR endpoint pubblico)

## legal-citations-ita

| Tool | Descrizione |
|---|---|
| `legal-citations-ita_validate` | Valida formato citazione normativa italiana |
| `legal-citations-ita_parse` | Estrae tipo, numero, anno, articolo, comma dalla citazione |
| `legal-citations-ita_format` | Formatta citazione in forma breve o completa |

**Pattern supportati**: D.Lgs., Legge, D.L., D.P.R., Regolamento UE, articoli e commi

## legal-persona-ita

| Tool | Descrizione |
|---|---|
| `legal-persona-ita_draft_document` | Redige bozza documento giuridico: contratto, ricorso, parere, lettera_formale, memoria_difensiva, atto_di_citazione |

**Template**: Testi predefiniti con placeholders per parti, oggetto, punti chiave
