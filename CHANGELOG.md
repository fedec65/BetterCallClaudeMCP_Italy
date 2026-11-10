# Changelog

Tutte le modifiche significative a questo progetto saranno documentate in questo file.

Il formato è basato su [Keep a Changelog](https://keepachangelog.com/it/1.0.0/),
e questo progetto aderisce a [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

### Fixed
- **I messaggi del server cassazione dichiarano solo ciò che è stato osservato**: il ramo «senza cookie» non attribuisce più al blocco per IP un timeout che non è mai avvenuto (nessuna richiesta viene inviata), gli errori di trasporto sono distinti dagli errori di autenticazione e da quelli generici, la descrizione di `cassazione_search_massime` promette `autenticazione.messaggio` solo quando la ricerca non è eseguibile (non quando restituisce zero risultati), `citation-verify-ita` non ripete la diagnosi due volte nello stesso errore `SOURCE_UNAVAILABLE` e la guida di setup nel README non suggerisce più `document.cookie` (cookie HttpOnly) né un nome di cookie non verificato.
- **Messaggi del server cassazione onesti sul blocco per IP**: `www.italgiure.giustizia.it` scarta a livello TCP le connessioni dal datacenter che ospita i server MCP, con o senza cookie di sessione. I messaggi di fallback dicevano «esegui document.cookie» (su cookie HttpOnly) e presentavano SentenzeWeb come alternativa gratuita, ma per il server è lo stesso endpoint scartato. Ora indicano la causa reale e il rimedio di ogni ramo: per il fallimento di trasporto e per il ramo «senza cookie» rimandano al canale lato client (skill `italgiure-search`), per la sessione rifiutata dal servizio (401/403) riportano la procedura di rinnovo e per gli errori generici riportano lo status HTTP.
- **Descrizioni dei tool aggiornate**: `cassazione_search_massime` e `cassazione_get_sentenza` non si presentano più come tool che «richiedono un cookie attivo»; dichiarano il limite di raggiungibilità. `citation-verify-ita_check_existence` dice che per le sentenze la verifica va fatta lato client.
- **`citation-verify-ita` distingue i casi**: per una sentenza non verificabile da questo server l'errore `SOURCE_UNAVAILABLE` riporta la diagnosi del ramo effettivamente verificato — nel fallimento di trasporto nomina il blocco per IP e il percorso alternativo, nel ramo «senza cookie» dice che nessuna richiesta è stata inviata al servizio e non attribuisce la mancata risposta al blocco per IP — invece di lasciare il cliente senza sapere se la sentenza esista, se la fonte sia giù o se il canale sia rotto. Il ramo normativo è invariato.

## [1.2.0] - 2026-08-28

### Aggiunto

- **Server `workflows-ita`** (nuovo workspace `mcp-servers/workflows`) — Porting italiano del server svizzero `workflows-ch`: workflow legali personalizzati riutilizzabili con 8 tool (`list_agents`, `validate_pipeline`, `save_workflow`, `list_workflows`, `get_workflow`, `delete_workflow`, `claim_user_id`, `log_run`). Persistenza su Postgres (`DATABASE_URL`) con schema idempotente e seed del manifest dei 16 agenti chainable del plugin italiano (`cantonal` → `regional`). Richiede un database Postgres provisioning (es. Railway) per l'uso a runtime.
- **Aggregatore** — Registrato `workflows-ita` su `POST /workflows-ita/mcp`.

### Note

- **Deroga deliberata all'envelope `{success, data}`** — Le risposte di `workflows-ita` usano JSON libero + `isError` (e `{valid:false, errors}` per gli errori di validazione pipeline) per parità di contratto col plugin, come nel server svizzero di origine.

## [1.1.2] - 2026-08-24

### Corretto

- **Throttle vault solo sulle miss** — Il controllo anti brute-force ora scatta solo quando la `session_key` non esiste: chi possiede una chiave valida non viene più bloccato quando il limite (20 miss/min) è raggiunto, eliminando il vettore di DoS verso gli altri utenti segnalato in review.

## [1.1.1] - 2026-08-24

Patch di sicurezza e robustezza a seguito della review automatizzata della 1.1.0.

### Corretto

- **Keep-alive conforme alla regola 8** — La query Solr del keep-alive ora passa da `fetchWithRetry` (rate limiter condiviso) con `retries: 1`: i 4xx non vengono ritentati e il rilevamento 401/403 resta invariato.
- **Versione endpoint `/`** — Non più hardcoded: letta dal `package.json` del package `mcp-servers-http`.

### Sicurezza

- **Salt scrypt per-entry** — La chiave AES-256-GCM è ora derivata da `SESSION_STORE_SECRET` + salt casuale per entry (le entry legacy senza salt restano leggibili via fallback al salt storico).
- **Passphrase min 16 caratteri** — `session_key` minima portata da 8 a 16 caratteri negli schemi dei tool `session_*`.
- **Throttle anti brute-force** — Le miss del vault (session_key inesistenti) sono limitate a 20/min process-wide con errore esplicito.

## [1.1.0] - 2026-08-24

### Aggiunto

- **Session vault ItalGiure (server `cassazione`)** — Nuovi tool `cassazione_session_set` / `cassazione_session_status` / `cassazione_session_delete`: ogni utente registra il proprio cookie una volta sola associandolo a una `session_key` (passphrase). Cookie cifrato AES-256-GCM a riposo, passphrase salvata solo come hash SHA-256. I tool `cassazione_search_massime` e `cassazione_get_sentenza` accettano il nuovo parametro opzionale `session_key` (priorità: `cookie` > `session_key` > `ITALGIURE_COOKIE` > file).
- **Keep-alive sessioni** — Ogni 6 ore una query Solr leggera per ciascun cookie registrato: mantiene vive le sessioni (sliding expiration) e marca `scaduta` su 401/403. Richiede `SESSION_STORE_SECRET` (e consigliato `SESSION_STORE_PATH` su volume Railway).

### Corretto

- **Rate limiter condiviso tra tutti gli utenti** (`mcp-servers-http`) — Mancava `app.set('trust proxy', 1)`: dietro il proxy Railway `req.ip` era sempre l'IP dell'edge e il bucket 30 req/15min era globale, causando 429 sistematici e il fallimento dell'handshake dei connettori Claude.ai (errore `ofid_...`). Ora il limite MCP è 300 req/15min **per IP utente**, i metodi di handshake/discovery (`initialize`, `tools/list`, `ping`, `notifications/*`) non consumano quota, e la rotta MCP è esclusa dal limiter generale. Limiti configurabili via `GENERAL_RATE_LIMIT_MAX` / `MCP_RATE_LIMIT_MAX`.
- **CORS** — Aggiunta `https://claude.ai` alla whitelist delle origini.

### Migliorato

- **Fallback scraper robusti** per i 3 server con accesso limitato:
  - `corte-costituzionale` — descrizione tool aggiornata con avviso anti-bot; fallback a URL diretti ECLI
  - `giustizia-amministrativa` — timeout fetch aumentato a 25s; fallback a URL DeJure open-access
  - `cassazione` — rilevamento rapido HTTP 403; fallback a ItalGiure + DeJure con URL completi nella risposta
- **Documentazione** — `AGENTS.md` aggiornato con tabella affidabilità fonti e strategia fallback

## [1.0.0] - 2026-05-19

### Aggiunto

- **7 MCP servers** per la ricerca giuridica italiana:
  - `normattiva` — ricerca atti legislativi via API Open Data ufficiale
  - `eur-lex-ita` — ricerca atti UE via SPARQL CELLAR con filtri avanzati
  - `corte-costituzionale` — ricerca sentenze Corte Costituzionale (con fallback URL)
  - `giustizia-amministrativa` — ricerca provvedimenti giustizia amministrativa
  - `cassazione` — ricerca massime e sentenze Cassazione (con fallback ItalGiure)
  - `legal-citations-ita` — validazione, parsing e formattazione citazioni giuridiche
  - `legal-persona-ita` — redazione documenti legali con template

- **HTTP Aggregator** — server Express unico che espone tutti i 7 endpoint MCP via `StreamableHTTPServerTransport` (protocollo MCP 2025-06-18)

- **Shared utilities** — cache LRU, rate limiter (bottleneck), HTTP client con retry (p-retry), parser errori standardizzato

- **Docker** — multi-stage build (`node:20-alpine`) con healthcheck

- **Railway deployment** — configurato via `railway.toml`, endpoint: `https://mcp-italia.bettercallclaude.ch`

- **CI/CD GitHub Actions** — test su Node 20.x/22.x, lint TypeScript, build Docker con healthcheck verification

- **Documentazione**:
  - `docs/01-ARCHITECTURE.md` — architettura e moduli
  - `docs/02-TOOL-SPECIFICATIONS.md` — specifiche tool per server
  - `docs/03-API-INTEGRATION-GUIDE.md` — guida integrazione API esterne
  - `docs/04-DEPLOYMENT-GUIDE.md` — guida deploy Railway/Docker

### Tecnologie

- Node.js ≥20, TypeScript 5.5+, ESM modules
- npm 10+ workspaces (9 package)
- Vitest 4.1.6 per i test (29 test su 11 file)
- MCP SDK 1.12.0
- AGPL-3.0-or-later license

[1.0.0]: https://github.com/fedec65/BetterCallClaudeMCP_Italy/releases/tag/v1.0.0
