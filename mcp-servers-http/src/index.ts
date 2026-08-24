import { app } from './app.js';
import { listServers } from './server-registry.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

// Start server — bind to 0.0.0.0 to accept connections from outside the container
app.listen(PORT, '0.0.0.0', () => {
  console.error(
    `BetterCallClaude Italia MCP Aggregator running on port ${PORT}`
  );
  console.error(`Health check: http://0.0.0.0:${PORT}/health`);

  const servers = listServers();
  if (servers.length === 0) {
    console.error('[WARN] Nessun server MCP registrato.');
  } else {
    servers.forEach((s) => {
      console.error(`  - /${s.path}/mcp -> ${s.name}`);
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.error('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.error('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});
