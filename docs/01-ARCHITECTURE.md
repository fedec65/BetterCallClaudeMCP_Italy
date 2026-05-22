# Architettura BetterCallClaude Italia

## Visione

BetterCallClaude Italia è un aggregatore di **MCP server** (Model Context Protocol) che espone fonti giuridiche italiane a modelli linguistici AI come Claude. L'architettura segue il pattern del progetto svizzero (`BetterCallClaudeMCP`) con miglioramenti: npm workspaces, aggregatore HTTP unico, protocollo MCP `2025-06-18`.

## Stack tecnologico

| Componente | Tecnologia |
|---|---|
| Runtime | Node.js ≥ 20 |
| Linguaggio | TypeScript 5.5+ |
| Moduli | ES Modules (`"type": "module"`) |
| Monorepo | npm workspaces |
| Build | `tsc` per workspace, `tsup` opzionale root |
| Test | vitest |
| HTTP | Express 4.x + `@modelcontextprotocol/sdk` StreamableHTTP |
| Protocollo MCP | `2025-06-18` |
| HTTP Client | axios + p-retry |
| Rate Limiting | bottleneck |
| Cache | lru-cache |
| Validazione | zod |
| Container | Docker multi-stage |

## Struttura del repository

```
mcp-servers/
├── shared/                  # Utility condivise (cache, rate-limiter, http-client)
├── normattiva/              # Legislazione italiana (API Open Data Normattiva)
├── corte-costituzionale/    # Sentenze Corte Costituzionale
├── giustizia-amministrativa/ # TAR + Consiglio di Stato
├── cassazione/              # Corte di Cassazione (porzione pubblica)
├── eur-lex-ita/             # Diritto UE (SPARQL CELLAR)
├── legal-citations-ita/     # Parsing/validazione citazioni
└── legal-persona-ita/       # Drafting documenti giuridici

mcp-servers-http/            # Aggregatore Express
├── src/index.ts             # Entry point HTTP
├── src/server-registry.ts   # Registro server MCP
├── Dockerfile               # Multi-stage build
└── railway.toml             # Config deploy Railway
```

## Pattern di deployment

### HTTP (raccomandato)

L'aggregatore Express monta ogni server su `POST /<server>/mcp` usando `StreamableHTTPServerTransport` in modalità stateless (`sessionIdGenerator: undefined`).

```
https://mcp-italia.bettercallclaude.ch/normattiva/mcp
https://mcp-italia.bettercallclaude.ch/corte-costituzionale/mcp
...
```

### stdio (locale/sviluppo)

Ogni server può essere eseguito standalone con `StdioServerTransport` per testing locale o integrazione con Claude Desktop.

## Flusso dati

```
Client MCP (Claude/Cowork)
    ↓ HTTP POST /<server>/mcp
Aggregatore Express
    ↓ crea Server MCP + StreamableHTTPServerTransport
    ↓ handleRequest(req, res, body)
Server MCP specifico
    ↓ ListTools / CallTool
Tool implementation
    ↓ fetch API esterna o logica interna
    ↓ Rate limit + Retry + Cache
Risposta JSON-RPC → Client
```

## Convenzioni

1. **Naming tool**: `<server>_<azione>` (es. `normattiva_search`)
2. **Risposte**: envelope `{ success, data, metadata }` o `{ success, error, metadata }`
3. **Metadata**: `requestId`, `timestamp`, `tool`, `processingTime`, `cached`
4. **Lingua**: descrizioni tool ed errori in italiano
5. **Import**: estensione `.js` obbligatoria (NodeNext resolution)
