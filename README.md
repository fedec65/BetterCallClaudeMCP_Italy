# BetterCallClaude Italia — MCP Servers

> Estensione italiana del framework open-source di ricerca giuridica AI [BetterCallClaude](https://bettercallclaude.ch).

## Visione

BetterCallClaude Italia espone un insieme di **MCP server** (Model Context Protocol) che consentono ai modelli linguistici di grande dimensione — in particolare Claude di Anthropic — di interrogare in modo strutturato le principali fonti giuridiche italiane gratuite e aperte.

## Endpoint di produzione

```
https://mcp-italia.bettercallclaude.ch
```

> ⚠️ **Attenzione**: il dominio è configurato ma il deploy su Railway deve essere attivato manualmente. Vedi [Guida al Deploy](docs/04-DEPLOYMENT-GUIDE.md).

## Server disponibili

| Server | Fonte | Endpoint |
|---|---|---|
| `normattiva` | Legislazione italiana (1861–oggi) | `/normattiva/mcp` |
| `corte-costituzionale` | Sentenze Corte Costituzionale | `/corte-costituzionale/mcp` |
| `giustizia-amministrativa` | TAR e Consiglio di Stato | `/giustizia-amministrativa/mcp` |
| `cassazione` | Giurisprudenza Corte di Cassazione (via ItalGiure Solr) | `/cassazione/mcp` |
| `eur-lex-ita` | Diritto UE in lingua italiana | `/eur-lex-ita/mcp` |
| `legal-citations-ita` | Validazione citazioni normative italiane | `/legal-citations-ita/mcp` |
| `legal-persona-ita` | Drafting documenti giuridici italiani + calcolo termini processuali | `/legal-persona-ita/mcp` |
| `citation-verify-ita` | Verifica esistenza citazioni giuridiche | `/citation-verify-ita/mcp` |

### Note sui server

- **Rate limiting**: il gateway è pubblico ma protetto da rate-limiting per IP (100 req/15min generico, 300 req/15min sulle chiamate tool MCP; i metodi di handshake/discovery — `initialize`, `tools/list`, `ping`, `notifications/*` — non contano ai fini del limite). Se superi i limiti, riceverai `429 Too Many Requests`. Limiti configurabili via env `GENERAL_RATE_LIMIT_MAX` e `MCP_RATE_LIMIT_MAX`.

### Cassazione — Setup cookie ItalGiure

Il server `cassazione` interroga l'API Solr di [ItalGiure](https://www.italgiure.giustizia.it/sncass/) (CED della Corte di Cassazione), che richiede autenticazione tramite cookie di sessione.

> **Nota sul deployment di produzione.** Misurato dal container: `www.italgiure.giustizia.it` scarta a livello TCP le connessioni provenienti dall'IP di datacenter che ospita i server MCP, con o senza cookie. Da qui la ricerca Cassazione **non è raggiungibile**: il canale supportato è lato client (skill `italgiure-search` del plugin BetterCallClaude Italia), che interroga lo stesso indice pubblico SentenzeWeb dall'IP del computer dell'utente. La procedura cookie qui sotto serve per esecuzioni locali (stdio) o per ambienti con IP ammesso.

#### Cosa succede senza cookie

Senza cookie configurato la ricerca **non viene eseguita**: il tool risponde subito con `success: false`, `cookieValido: false`, `totale: 0` e i link di fallback per la consultazione manuale (SentenzeWeb, ECLI, Google, DuckDuckGo). Nessuna richiesta viene inviata a ItalGiure, quindi il messaggio non attribuisce la mancata risposta a un blocco per IP.

#### Come ottenere e configurare il cookie

1. **Accedi a ItalGiure** con SPID o credenziali professionali:
   - Vai sull'**area riservata**: https://www.italgiure.giustizia.it/new/archives
   - Esegui il login (SPID, CNS, o credenziali ministeriali/professionali)

2. **Estrai il cookie di sessione** dal browser:
   - Apri DevTools (F12 / Cmd+Option+I) → scheda **Network**
   - Fai una ricerca nell'area riservata e individua la richiesta dati
   - Apri la richiesta → **Request Headers** → copia il valore completo dell'intestazione **Cookie**
   - I cookie dell'area riservata sono **HttpOnly**: la scheda Application/Storage può mostrarne il nome, ma dalla Console il valore non è leggibile e il nome del cookie può cambiare fra un rilascio e l'altro: copia l'intera intestazione, non un singolo valore

3. **Configura la variabile d'ambiente**:
   ```bash
   # Nel file .env del server (o variabile d'ambiente Railway)
   ITALGIURE_COOKIE="nome=valore; altro=valore"
   ```
   Oppure salva il cookie in un file `italgiure_cookie.txt` nella working directory del server.

#### Durata e rinnovo

- Il cookie di sessione ItalGiure ha durata limitata (tipicamente alcune ore)
- Quando scade, il connettore rileva l'invalidità (401/403) e restituisce i fallback con la procedura di rinnovo
- Per un uso continuativo, il cookie deve essere rinnovato periodicamente

#### Session vault per-utente (tool `cassazione_session_*`)

Ogni utente può registrare il **proprio** cookie sul server una volta sola, invece di passarlo a ogni chiamata:

- `cassazione_session_set(session_key, cookie)` — registra il cookie associato a una passphrase (`session_key`, min 16 caratteri). Il cookie è cifrato AES-256-GCM a riposo; la passphrase è salvata solo come hash SHA-256.
- `cassazione_session_status(session_key)` — stato della sessione (attiva/scaduta, ultimo keep-alive), senza esporre il cookie.
- `cassazione_session_delete(session_key)` — elimina la sessione.
- I tool `cassazione_search_massime` e `cassazione_get_sentenza` accettano il parametro `session_key` in alternativa a `cookie` (priorità: `cookie` > `session_key` > `ITALGIURE_COOKIE` > file).

Un **keep-alive ogni 6 ore** esegue una query leggera con ciascun cookie registrato: mantiene viva la sessione se ItalGiure usa scadenza sliding e marca `scaduta` la sessione su 401/403, così i tool guidano l'utente al rinnovo.

Configurazione lato server (Railway):

```bash
SESSION_STORE_SECRET="<stringa casuale lunga>"   # obbligatoria: abilita il vault
SESSION_STORE_PATH="/data/italgiure_sessions.json"  # consigliato: path su volume Railway
```

Senza `SESSION_STORE_SECRET` il vault è disabilitato e i tool `session_*` rispondono con errore esplicito.

> Nota: l'automazione del login SPID non è possibile (presenza utente + 2FA, regole AGID). Il vault con keep-alive è l'approssimazione supportata della "sessione persistente".

## Configurazione plugin BetterCallClaude

Aggiungi al tuo `.mcp.json`:

```json
{
  "mcpServers": {
    "normattiva": { "type": "http", "url": "https://mcp-italia.bettercallclaude.ch/normattiva/mcp" },
    "corte-costituzionale": { "type": "http", "url": "https://mcp-italia.bettercallclaude.ch/corte-costituzionale/mcp" },
    "giustizia-amministrativa": { "type": "http", "url": "https://mcp-italia.bettercallclaude.ch/giustizia-amministrativa/mcp" },
    "cassazione": { "type": "http", "url": "https://mcp-italia.bettercallclaude.ch/cassazione/mcp" },
    "eur-lex-ita": { "type": "http", "url": "https://mcp-italia.bettercallclaude.ch/eur-lex-ita/mcp" },
    "legal-citations-ita": { "type": "http", "url": "https://mcp-italia.bettercallclaude.ch/legal-citations-ita/mcp" },
    "legal-persona-ita": { "type": "http", "url": "https://mcp-italia.bettercallclaude.ch/legal-persona-ita/mcp" },
    "citation-verify-ita": { "type": "http", "url": "https://mcp-italia.bettercallclaude.ch/citation-verify-ita/mcp" }
  }
}
```

## Deploy su Railway (Produzione)

Il progetto è pronto per il deploy su [Railway](https://railway.app) con auto-deploy su ogni push a `main`.

**Passi rapidi:**
1. Vai su https://railway.app → Login con GitHub
2. **New Project** → **Deploy from GitHub repo**
3. Seleziona `fedec65/BetterCallClaudeMCP_Italy`
4. Railway rileva automaticamente `railway.toml` e il Dockerfile
5. Clicca **Deploy** — il servizio è online in 2-3 minuti
6. (Opzionale) Configura il dominio custom `mcp-italia.bettercallclaude.ch`

Per la guida completa passo-passo: [docs/04-DEPLOYMENT-GUIDE.md](docs/04-DEPLOYMENT-GUIDE.md)

## Sviluppo locale

```bash
# Installazione dipendenze
npm install

# Build tutti i workspace
npm run build --workspaces

# Avvio aggregatore HTTP
npm start

# Test
npm run test:run

# Type check
npm run typecheck --workspaces
```

## Struttura del repository

```
mcp-servers/
├── normattiva/
├── corte-costituzionale/
├── giustizia-amministrativa/
├── cassazione/
├── citation-verify-ita/
├── eur-lex-ita/
├── legal-citations-ita/
├── legal-persona-ita/
└── shared/           # Utilità condivise

mcp-servers-http/     # Aggregatore HTTP Express
docs/                 # Documentazione
```

## Documentazione

- [Architettura](docs/01-ARCHITECTURE.md)
- [Specifiche Tool](docs/02-TOOL-SPECIFICATIONS.md)
- [Guida Integrazione API](docs/03-API-INTEGRATION-GUIDE.md)
- [Guida al Deploy](docs/04-DEPLOYMENT-GUIDE.md)

## Licenza

GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)

---

*Progetto BetterCallClaude Associazione (Art. 60 CC svizzero)*
