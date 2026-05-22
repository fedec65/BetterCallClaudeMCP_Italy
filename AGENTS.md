# AGENTS.md — BetterCallClaude Italia

Quick reference per agenti di coding che lavorano su questo repository.

## Stack

- **Runtime:** Node.js ≥ 20, TypeScript 5.5+
- **Modules:** ES Modules (`"type": "module"`), import con estensione `.js`
- **Monorepo:** npm workspaces (`mcp-servers/*`, `mcp-servers-http`)
- **Build:** `tsc` per server, `npm run build` in root fa build di tutti i workspace
- **Test:** vitest
- **HTTP:** Express 4.x + `@modelcontextprotocol/sdk` StreamableHTTP
- **Protocollo MCP:** `2025-06-18`

## Convenzioni

1. **Import extensions:** `import { foo } from './bar.js'` (anche per file `.ts`)
2. **Naming tool:** `<server>_<azione>` (es. `normattiva_search`, `normattiva_get_atto`)
3. **Risposte MCP:** JSON stringify con envelope `{ success, data, metadata }` o `{ success, error, metadata }`
4. **Metadata:** `requestId`, `timestamp`, `tool`, `processingTime`, `cached`
5. **Lingua:** descrizioni tool ed errori user-facing in **italiano**
6. **Logging:** `console.error` per log operativi, niente `console.log` in produzione
7. **Rate limiting:** sempre usare `bottleneck` da `@bettercallclaude-italia/shared`
8. **HTTP client:** sempre usare `createHttpClient` + `fetchWithRetry` da `shared`

## Comandi utili

```bash
npm install              # installa tutti i workspace
npm run build            # build tutti i workspace
npm run typecheck        # typecheck tutti i workspace
npm test                 # vitest watch mode
npm run test:run         # vitest singola run
npm start                # avvia aggregatore HTTP
```

## Struttura di un server MCP

Ogni server in `mcp-servers/<nome>/src/`:

```
index.ts       # Factory create<Nome>Server(): Server + stdio entry point
types.ts       # Zod schemas + TypeScript types
tools/
  *.ts         # Implementazioni tool
__tests__/
  *.test.ts    # Test vitest
```

L'aggregatore in `mcp-servers-http/src/server-registry.ts` importa la factory di ogni server e lo monta su `POST /<nome>/mcp`.

## Fonti dati

| Server | Fonte | Tipo accesso | Affidabilità |
|---|---|---|---|
| normattiva | dati.normattiva.it | Open Data API | ✅ Alta |
| corte-costituzionale | cortecostituzionale.it | Web scraping | ⚠️ Bassa (anti-bot DataDome) |
| giustizia-amministrativa | giustizia-amministrativa.it | Web scraping | ⚠️ Bassa (Liferay instabile) |
| cassazione | cortedicassazione.it / italgiure.giustizia.it | Web scraping / Istituzionale | ❌ Molto bassa (403 bloccante) |
| eur-lex-ita | eur-lex.europa.eu | Open + API + SPARQL | ✅ Alta |
| legal-citations-ita | Logica interna | — | ✅ Alta |
| legal-persona-ita | Logica interna | — | ✅ Alta |

### Strategia fallback per scraper problematici

I 3 server basati su scraping (corte-costituzionale, giustizia-amministrativa, cassazione) sono progettati per restituire **URL diretti di consultazione** quando lo scraping fallisce, invece di restituire errori grezzi. Questo permette all'utente (o a Claude) di consultare manualmente le fonti.

- **Corte Costituzionale:** fallback a `actionPronuncia.do` e `actionSchedaPronuncia.do` con ECLI
- **Giustizia Amministrativa:** fallback al portale Liferay + URL DeJure open-access
- **Cassazione:** fallback a ItalGiure (operatori del diritto) + DeJure (open-access)

**Non usare Puppeteer/Playwright** per aggirare le protezioni: violerebbe i ToS dei portali, aumenterebbe i tempi di deploy e non risolverebbe in modo affidabile.

## Branching

- `main` → produzione, auto-deploy Railway
- `dev` → integrazione, PR target
- `feat/<nome>` → feature branches
