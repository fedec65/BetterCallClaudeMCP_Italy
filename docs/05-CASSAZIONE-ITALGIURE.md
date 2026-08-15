# Configurazione MCP Cassazione (ItalGiure)

Il server MCP `cassazione` richiede un cookie di sessione attivo da **ItalGiure** (area riservata `italgiure.giustizia.it/new/archives`) per accedere all'API Solr del CED Ministero della Giustizia. Senza cookie, il tool restituisce solo URL di fallback per la consultazione manuale.

## Passo 1: Accedere a ItalGiure

1. Apri il browser (Chrome, Firefox, Safari, Edge).
2. Vai sull'**area riservata** ItalGiure: https://www.italgiure.giustizia.it/new/archives

   > La pagina di ricerca libera (`/sncass/`, "Sentenze Cassazione") **non** richiede login: non è lì che si ottiene il cookie. Il cookie di sessione viene rilasciato dall'area riservata dopo l'autenticazione e vale per tutto il dominio `www.italgiure.giustizia.it` (incluso l'endpoint Solr sotto `/sncass` usato dal server).
3. Effettua il login con:
   - **SPID** (Sistema Pubblico di Identità Digitale), oppure
   - **Credenziali professionali** (es. Avvocatura)
4. Attendi il caricamento della pagina principale (motore di ricerca sentenze).

> **Nota**: se non hai accesso a ItalGiure, contatta il Ministero della Giustizia o il tuo Ordine di appartenenza. L'MCP non può bypassare l'autenticazione.

## Passo 2: Estrarre il cookie di sessione

Una volta loggato su ItalGiure:

1. Nella stessa scheda del browser, premi `F12` (o `Ctrl+Shift+I` su Linux, `Cmd+Option+I` su macOS) per aprire gli **Strumenti per sviluppatori** (DevTools).
2. Vai alla scheda **"Console"** (o **"Console JavaScript"**).
3. Digita il seguente comando e premi Invio:
   ```javascript
   document.cookie
   ```
4. Copia l'output completo. Dovrebbe essere una stringa simile a:
   ```
   ASPSESSIONIDXXXXXXXX=ABCDEFGHIJKLMNOPQRSTUVWXYZ
   ```
   (il valore esatto varia, ma è lungo e alfanumerico).

> **Importante**: il cookie è `HttpOnly` e di lunga durata (fino a 30 giorni). Conservalo in un posto sicuro e non condividerlo.

## Passo 3: Usare il cookie nel plugin BetterCallClaude

Ci sono **tre modi** per fornire il cookie al server MCP. Il parametro `cookie` ha la priorità più alta.

### Metodo 1: Parametro `cookie` nel tool (consigliato per utenti finali)

Quando chiami il tool MCP, includi il cookie come parametro opzionale:

```json
{
  "query": "responsabilita medica",
  "cookie": "ASPSESSIONIDXXXXXXXX=ABCDEFGHIJKLMNOPQRSTUVWXYZ"
}
```

Esempio con `cassazione_get_sentenza`:

```json
{
  "id": "snciv2024332127S",
  "cookie": "ASPSESSIONIDXXXXXXXX=ABCDEFGHIJKLMNOPQRSTUVWXYZ"
}
```

> **Vantaggio**: non devi configurare nulla sul server. Il cookie passa direttamente dalla tua chiamata MCP al tool.

### Metodo 2: Variabile d'ambiente (consigliato per server/deploy)

Aggiungi la variabile d'ambiente `ITALGIURE_COOKIE` al sistema dove gira il server MCP.

**macOS/Linux (bash/zsh):**
```bash
export ITALGIURE_COOKIE="ASPSESSIONIDXXXXXXXX=ABCDEFGHIJKLMNOPQRSTUVWXYZ"
```

**Windows (PowerShell):**
```powershell
$env:ITALGIURE_COOKIE="ASPSESSIONIDXXXXXXXX=ABCDEFGHIJKLMNOPQRSTUVWXYZ"
```

**Windows (Prompt dei comandi):**
```cmd
set ITALGIURE_COOKIE=ASPSESSIONIDXXXXXXXX=ABCDEFGHIJKLMNOPQRSTUVWXYZ
```

Per renderla permanente su macOS/Linux, aggiungi la riga al tuo `~/.zshrc`, `~/.bashrc` o `~/.bash_profile`.

### Metodo 3: File di testo (semplice per sviluppo locale)

1. Nella directory di lavoro del progetto (dove esegui `npm start`), crea un file chiamato `italgiure_cookie.txt`.
2. Incolla il valore del cookie (solo il valore, senza virgolette):
   ```
   ASPSESSIONIDXXXXXXXX=ABCDEFGHIJKLMNOPQRSTUVWXYZ
   ```
3. Salva il file.

> **Sicurezza**: aggiungi `italgiure_cookie.txt` al `.gitignore` per non committarlo accidentalmente. Il progetto attuale non lo include di default.

## Passo 4: Verificare che funzioni

1. Assicurati che il progetto sia buildato:
   ```bash
   npm run build
   ```
2. Avvia l'aggregatore HTTP:
   ```bash
   npm start
   ```
3. Con un client MCP (es. Claude Desktop), chiama il tool `cassazione_search_massime` con una query semplice:
   - Se il cookie è configurato correttamente, riceverai risultati strutturati da ItalGiure Solr.
   - Se il cookie manca o è scaduto, riceverai una risposta con `autenticazione.cookieValido: false` e istruzioni di configurazione.

## Passo 5: Gestione del cookie scaduto

Il cookie ha durata fino a 30 giorni. Quando scade:

1. Ripeti il **Passo 2** (estrazione cookie dal browser) — la sessione browser deve essere ancora attiva.
2. Se usi il **Metodo 1** (parametro `cookie`), aggiorna il valore nella chiamata MCP.
3. Se usi il **Metodo 2** (env var) o **Metodo 3** (file), aggiorna la configurazione e riavvia il server (env var) o semplicemente richiama il tool (file).

## Troubleshooting rapido

| Sintomo | Causa | Soluzione |
|---|---|---|
| `cookieValido: false` | Cookie non configurato | Segui Passo 3 |
| `cookieValido: false` + "Sessione scaduta" | Cookie scaduto o errato | Estrai un nuovo cookie dal browser |
| Errore SSL/TLS | Certificato CA non standard (TI Trust Technologies) | Già gestito dal codice (`rejectUnauthorized: false`) |
| Nessun risultato | Query troppo restrittiva o database vuoto | Prova query più generica |
