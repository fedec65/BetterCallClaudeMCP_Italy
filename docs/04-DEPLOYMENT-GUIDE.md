# Guida al Deployment

## Requisiti

- Node.js ≥ 20
- npm ≥ 10
- Docker (per build immagine)
- Account Railway (per deploy produzione)

---

## Sviluppo locale

```bash
# Installazione dipendenze
cd BetterCallClaudeMCP_Italy
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

## Docker

```bash
# Build immagine
docker build -f mcp-servers-http/Dockerfile -t bcc-italia .

# Run container
docker run -p 8080:8080 bcc-italia

# Health check
curl http://localhost:8080/health
```

---

## Railway — Deploy via Dashboard (Raccomandato)

### Prerequisiti

- Account Railway (gratuito): https://railway.app
- Repo GitHub già pushato e pubblico (o con accesso a Railway)

### Passo 1: Accedere a Railway

1. Vai su https://railway.app
2. Clicca **"Get Started"** o **"Login"**
3. Scegli **"Continue with GitHub"** (il modo più veloce)
4. Autorizza Railway ad accedere ai tuoi repository

### Passo 2: Creare il progetto

1. Dalla dashboard Railway, clicca **"New Project"**
2. Seleziona **"Deploy from GitHub repo"**
3. Cerca e seleziona il repository: `fedec65/BetterCallClaudeMCP_Italy`
4. Se il repo è privato, potrebbe essere necessario cliccare **"Configure GitHub App"** e dare il permesso a Railway

### Passo 3: Railway rileva la configurazione automaticamente

Railway leggerà automaticamente il file `railway.toml` nella root del progetto:

```toml
[build]
builder = "dockerfile"
dockerfilePath = "mcp-servers-http/Dockerfile"

[deploy]
startCommand = "node mcp-servers-http/dist/index.js"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
healthcheckPath = "/health"
healthcheckTimeout = 100
```

Non è necessario modificare nulla. Clicca **"Deploy"**.

### Passo 4: Attendere il primo deploy

- Railway builda l'immagine Docker (~2-3 minuti)
- Deploya il container
- Esegue il healthcheck su `/health`
- Se tutto è verde, il servizio è online

### Passo 5: Generare il dominio pubblico

1. Nella dashboard Railway, clicca sul servizio appena creato
2. Vai alla scheda **"Settings"** → **"Networking"**
3. Clicca **"Generate Domain"**
4. Railway assegna un dominio tipo `bettercallclaude-mcp-italy.up.railway.app`

### Passo 6: (Opzionale) Configurare dominio custom

Se vuoi usare `mcp-italia.bettercallclaude.ch`:

1. Nella scheda **"Networking"** del servizio, clicca **"Custom Domain"**
2. Inserisci il dominio: `mcp-italia.bettercallclaude.ch`
3. Railway fornirà un record DNS (CNAME) da aggiungere nel tuo provider DNS
4. Aggiungi il CNAME nel pannello del tuo registrar/DNS provider
5. Attendi la propagazione DNS (5-30 minuti)
6. Railway verificherà automaticamente il dominio

### Passo 7: Verificare il deploy

```bash
curl https://<TUO-DOMINIO-RAILWAY>.up.railway.app/health
```

Risposta attesa:
```json
{
  "status": "ok",
  "servers": 7,
  "serverNames": ["normattiva", "corte-costituzionale", "giustizia-amministrativa", "cassazione", "eur-lex-ita", "legal-citations-ita", "legal-persona-ita"],
  "endpoints": ["/normattiva/mcp", "/corte-costituzionale/mcp", "/giustizia-amministrativa/mcp", "/cassazione/mcp", "/eur-lex-ita/mcp", "/legal-citations-ita/mcp", "/legal-persona-ita/mcp"],
  "timestamp": "..."
}
```

### Auto-deploy

Ogni push su `main` triggera automaticamente un nuovo deploy su Railway. Non serve fare nulla manualmente.

Se vuoi disabilitare l'auto-deploy:
1. Vai su **Settings** → **General** del servizio
2. Disabilita **"Auto-Deploy"**

---

## Railway — Deploy via CLI (Alternativa)

```bash
# Installa Railway CLI
npm install -g @railway/cli

# Login (apre il browser)
railway login

# Inizializza il progetto (nella root del repo)
cd BetterCallClaudeMCP_Italy
railway init

# Deploy
railway up

# Genera dominio
railway domain
```

---

## Health Check

```bash
GET https://<TUO-DOMINIO>/health

{
  "status": "ok",
  "servers": 7,
  "serverNames": ["normattiva", "corte-costituzionale", ...],
  "endpoints": ["/normattiva/mcp", ...],
  "timestamp": "..."
}
```

---

## Variabili d'ambiente

| Variabile | Default | Descrizione |
|---|---|---|
| `PORT` | 8080 | Porta aggregatore HTTP (Railway la sovrascrive automaticamente) |
| `NORMATTIVA_API_BASE` | `https://api.normattiva.it/t/normattiva.api` | Base URL API Normattiva |
| `NODE_ENV` | — | `production` o `development` |

Per aggiungere variabili su Railway:
1. Dashboard → Servizio → **Variables**
2. Clicca **"New Variable"**
3. Inserisci nome e valore

---

## Configurazione Plugin BetterCallClaude

Aggiungere al `.mcp.json` (o configurazione MCP del client):

```json
{
  "mcpServers": {
    "normattiva": { "type": "http", "url": "https://<TUO-DOMINIO>/normattiva/mcp" },
    "corte-costituzionale": { "type": "http", "url": "https://<TUO-DOMINIO>/corte-costituzionale/mcp" },
    "giustizia-amministrativa": { "type": "http", "url": "https://<TUO-DOMINIO>/giustizia-amministrativa/mcp" },
    "cassazione": { "type": "http", "url": "https://<TUO-DOMINIO>/cassazione/mcp" },
    "eur-lex-ita": { "type": "http", "url": "https://<TUO-DOMINIO>/eur-lex-ita/mcp" },
    "legal-citations-ita": { "type": "http", "url": "https://<TUO-DOMINIO>/legal-citations-ita/mcp" },
    "legal-persona-ita": { "type": "http", "url": "https://<TUO-DOMINIO>/legal-persona-ita/mcp" }
  }
}
```

---

## Troubleshooting

### Build fallisce su Railway

Verifica che il Dockerfile buildi correttamente in locale:
```bash
docker build -f mcp-servers-http/Dockerfile -t test .
```

### Healthcheck fallisce

Controlla i log su Railway Dashboard → Servizio → **Deployments** → clicca sul deploy → **Logs**.

### "Cannot find module" errori

Assicurati che il `.railwayignore` escluda `node_modules/` e `dist/` (già configurato).

### Dominio custom non funziona

- Verifica che il record DNS CNAME sia propagato: `dig CNAME mcp-italia.bettercallclaude.ch`
- Attendi almeno 30 minuti per la propagazione
- Su Railway, clicca **"Verify"** nella sezione Custom Domain
