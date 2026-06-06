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
| `legal-persona-ita` | Drafting documenti giuridici italiani | `/legal-persona-ita/mcp` |

### Note sui server

- **Rate limiting**: il gateway è pubblico ma protetto da rate-limiting per IP (100 req/15min generico, 30 req/15min su endpoint MCP). Se superi i limiti, riceverai `429 Too Many Requests`.

### Cassazione — Setup cookie ItalGiure

Il server `cassazione` interroga l'API Solr di [ItalGiure](https://www.italgiure.giustizia.it/sncass/) (CED della Corte di Cassazione), che richiede autenticazione tramite cookie di sessione.

#### Cosa succede senza cookie

Senza il cookie configurato, il connettore **funziona comunque** ma con capacità ridotte:
- La ricerca restituisce URL di fallback per la consultazione manuale (SentenzeWeb, Google, DuckDuckGo)
- [SentenzeWeb](https://www.italgiure.giustizia.it/sncass/) è gratuito e copre le sentenze dal 2012 in poi, ma non è interrogabile via API
- Le massime complete e le sentenze precedenti al 2012 non sono accessibili senza autenticazione

#### Come ottenere e configurare il cookie

1. **Accedi a ItalGiure** con SPID o credenziali istituzionali:
   - Vai su https://www.italgiure.giustizia.it/sncass/
   - Esegui il login (SPID, CNS, o credenziali ministeriali/professionali)

2. **Estrai il cookie di sessione** dal browser:
   - Apri DevTools (F12) → scheda **Application** (Chrome) o **Storage** (Firefox)
   - Sezione **Cookies** → `https://www.italgiure.giustizia.it`
   - Copia il valore del cookie `JSESSIONID` (es. `JSESSIONID=ABC123DEF456`)
   - In alternativa, dalla Console: `document.cookie`

3. **Configura la variabile d'ambiente**:
   ```bash
   # Nel file .env del server (o variabile d'ambiente Railway)
   ITALGIURE_COOKIE="JSESSIONID=ABC123DEF456"
   ```
   Oppure salva il cookie in un file `italgiure_cookie.txt` nella working directory del server.

#### Durata e rinnovo

- Il cookie di sessione ItalGiure ha durata limitata (tipicamente alcune ore)
- Quando scade, il connettore rileva automaticamente l'invalidità e restituisce i fallback
- Per un uso continuativo, il cookie deve essere rinnovato periodicamente

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
    "legal-persona-ita": { "type": "http", "url": "https://mcp-italia.bettercallclaude.ch/legal-persona-ita/mcp" }
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
