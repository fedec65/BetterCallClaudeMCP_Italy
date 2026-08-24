import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getServerFactory, listServers } from './server-registry.js';

const app = express();

// Railway instrada tramite un solo proxy edge: senza trust proxy req.ip e
// sempre l'IP dell'edge e il rate limiter conterebbe tutti gli utenti in un
// unico bucket condiviso.
app.set('trust proxy', 1);

/**
 * CORS whitelist — restrict to known origins.
 */
const allowedOrigins = [
  /^https:\/\/[^/]+\.bettercallclaude\.ch$/,
  /^https:\/\/[^/]+\.bettercallclaude\.it$/,
  /^https:\/\/bettercallclaude\.ch$/,
  /^https:\/\/bettercallclaude\.it$/,
  /^https:\/\/claude\.ai$/,
  /^http:\/\/localhost:\d+$/,
];

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // allow non-browser clients (curl, server-to-server)
  return allowedOrigins.some((pattern) => pattern.test(origin));
}

/**
 * Security middleware
 */
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS non consentito per questa origine'));
      }
    },
  })
);
app.use(express.json());

/**
 * General rate limiter for all routes.
 * La rotta MCP e esclusa: ha un limiter dedicato (mcpLimiter).
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.GENERAL_RATE_LIMIT_MAX
    ? parseInt(process.env.GENERAL_RATE_LIMIT_MAX, 10)
    : 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.method === 'POST' && req.path.endsWith('/mcp'),
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Troppe richieste. Attendi prima di riprovare.',
    });
  },
});
app.use(generalLimiter);

/**
 * Stricter rate limiter for MCP tool calls.
 *
 * I metodi JSON-RPC di handshake/discovery (initialize, tools/list, ping,
 * notifications/*) non consumano quota: il connettore Claude.ai li ripete a
 * ogni connessione e con un bucket ridotto l'handshake fallirebbe (429).
 */
const HANDSHAKE_METHODS = new Set([
  'initialize',
  'ping',
  'tools/list',
  'resources/list',
  'resources/templates/list',
  'prompts/list',
]);

const mcpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.MCP_RATE_LIMIT_MAX
    ? parseInt(process.env.MCP_RATE_LIMIT_MAX, 10)
    : 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    const method = (req.body as { method?: string } | undefined)?.method;
    if (!method) return false;
    return HANDSHAKE_METHODS.has(method) || method.startsWith('notifications/');
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Troppe richieste MCP. Attendi prima di riprovare.',
    });
  },
});

/**
 * Health check rate limiter.
 */
const healthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Troppe richieste di health check. Attendi prima di riprovare.',
    });
  },
});

/**
 * Health check endpoint — minimal info to reduce information disclosure.
 */
app.get('/health', healthLimiter, (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

/**
 * Root endpoint — service info.
 */
app.get('/', (_req: Request, res: Response) => {
  const servers = listServers();
  res.json({
    name: 'BetterCallClaude Italia MCP Aggregator',
    version: '1.0.0',
    description: 'Aggregatore HTTP per i server MCP del diritto italiano',
    endpoint_pattern: '/<server>/mcp',
    servers: servers.map((s) => ({
      name: s.name,
      description: s.description,
      endpoint: `/${s.path}/mcp`,
    })),
    health: '/health',
    documentation: 'https://github.com/fedec65/BetterCallClaudeMCP_Italy',
  });
});

/**
 * security.txt endpoint (RFC 9116).
 */
app.get('/.well-known/security.txt', (_req: Request, res: Response) => {
  res.type('text/plain');
  res.send(
    'Contact: security@bettercallclaude.ch\n' +
    'Acknowledgments: https://bettercallclaude.ch/security\n' +
    'Policy: https://bettercallclaude.ch/security-policy\n'
  );
});

/**
 * MCP Streamable HTTP endpoint for each registered server.
 */
app.post('/:serverName/mcp', mcpLimiter, async (req: Request, res: Response) => {
  const serverName = req.params.serverName;
  if (!serverName) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Nome server mancante',
      },
      id: null,
    });
    return;
  }

  const factory = getServerFactory(serverName);
  if (!factory) {
    res.status(404).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: `Server non trovato: ${serverName}`,
      },
      id: null,
    });
    return;
  }

  try {
    const server = factory();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error(`Errore MCP [${serverName}]:`, error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Errore interno del server',
        },
        id: null,
      });
    }
  }
});

/**
 * 405 for GET on MCP endpoints (stateless mode does not use SSE).
 */
app.get('/:serverName/mcp', (_req: Request, res: Response) => {
  res.status(405).set('Allow', 'POST').json({
    error: 'Method Not Allowed',
    message: 'Usare POST per le richieste MCP Streamable HTTP',
  });
});

export { app };
