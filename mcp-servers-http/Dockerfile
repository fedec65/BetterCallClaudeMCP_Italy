# BetterCallClaude Italia — MCP HTTP Aggregator
# Multi-stage build for production

FROM node:20-alpine AS builder
WORKDIR /app

# Copy root workspace configuration
COPY package*.json ./
COPY tsconfig.json ./

# Copy all workspace package.json files first (for layer caching)
COPY mcp-servers/shared/package*.json mcp-servers/shared/
COPY mcp-servers/shared/tsconfig.json mcp-servers/shared/
COPY mcp-servers/normattiva/package*.json mcp-servers/normattiva/
COPY mcp-servers/normattiva/tsconfig.json mcp-servers/normattiva/
COPY mcp-servers/corte-costituzionale/package*.json mcp-servers/corte-costituzionale/
COPY mcp-servers/corte-costituzionale/tsconfig.json mcp-servers/corte-costituzionale/
COPY mcp-servers/giustizia-amministrativa/package*.json mcp-servers/giustizia-amministrativa/
COPY mcp-servers/giustizia-amministrativa/tsconfig.json mcp-servers/giustizia-amministrativa/
COPY mcp-servers/cassazione/package*.json mcp-servers/cassazione/
COPY mcp-servers/cassazione/tsconfig.json mcp-servers/cassazione/
COPY mcp-servers/citation-verify-ita/package*.json mcp-servers/citation-verify-ita/
COPY mcp-servers/citation-verify-ita/tsconfig.json mcp-servers/citation-verify-ita/
COPY mcp-servers/eur-lex-ita/package*.json mcp-servers/eur-lex-ita/
COPY mcp-servers/eur-lex-ita/tsconfig.json mcp-servers/eur-lex-ita/
COPY mcp-servers/legal-citations-ita/package*.json mcp-servers/legal-citations-ita/
COPY mcp-servers/legal-citations-ita/tsconfig.json mcp-servers/legal-citations-ita/
COPY mcp-servers/legal-persona-ita/package*.json mcp-servers/legal-persona-ita/
COPY mcp-servers/legal-persona-ita/tsconfig.json mcp-servers/legal-persona-ita/
COPY mcp-servers-http/package*.json mcp-servers-http/
COPY mcp-servers-http/tsconfig.json mcp-servers-http/

# Install dependencies (workspaces)
RUN npm ci

# Copy all source code
COPY mcp-servers/shared/src mcp-servers/shared/src
COPY mcp-servers/normattiva/src mcp-servers/normattiva/src
COPY mcp-servers/corte-costituzionale/src mcp-servers/corte-costituzionale/src
COPY mcp-servers/giustizia-amministrativa/src mcp-servers/giustizia-amministrativa/src
COPY mcp-servers/cassazione/src mcp-servers/cassazione/src
COPY mcp-servers/citation-verify-ita/src mcp-servers/citation-verify-ita/src
COPY mcp-servers/eur-lex-ita/src mcp-servers/eur-lex-ita/src
COPY mcp-servers/legal-citations-ita/src mcp-servers/legal-citations-ita/src
COPY mcp-servers/legal-persona-ita/src mcp-servers/legal-persona-ita/src
COPY mcp-servers-http/src mcp-servers-http/src

# Build all workspaces (root script builds shared+normattiva+cassazione first,
# required by cross-workspace subpath exports used by citation-verify-ita)
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy root package files
COPY package*.json ./

# Copy built artifacts and package.json for each workspace
COPY --from=builder /app/mcp-servers/shared/dist mcp-servers/shared/dist
COPY --from=builder /app/mcp-servers/shared/package.json mcp-servers/shared/
COPY --from=builder /app/mcp-servers/normattiva/dist mcp-servers/normattiva/dist
COPY --from=builder /app/mcp-servers/normattiva/package.json mcp-servers/normattiva/
COPY --from=builder /app/mcp-servers/corte-costituzionale/dist mcp-servers/corte-costituzionale/dist
COPY --from=builder /app/mcp-servers/corte-costituzionale/package.json mcp-servers/corte-costituzionale/
COPY --from=builder /app/mcp-servers/giustizia-amministrativa/dist mcp-servers/giustizia-amministrativa/dist
COPY --from=builder /app/mcp-servers/giustizia-amministrativa/package.json mcp-servers/giustizia-amministrativa/
COPY --from=builder /app/mcp-servers/cassazione/dist mcp-servers/cassazione/dist
COPY --from=builder /app/mcp-servers/cassazione/package.json mcp-servers/cassazione/
COPY --from=builder /app/mcp-servers/citation-verify-ita/dist mcp-servers/citation-verify-ita/dist
COPY --from=builder /app/mcp-servers/citation-verify-ita/package.json mcp-servers/citation-verify-ita/
COPY --from=builder /app/mcp-servers/eur-lex-ita/dist mcp-servers/eur-lex-ita/dist
COPY --from=builder /app/mcp-servers/eur-lex-ita/package.json mcp-servers/eur-lex-ita/
COPY --from=builder /app/mcp-servers/legal-citations-ita/dist mcp-servers/legal-citations-ita/dist
COPY --from=builder /app/mcp-servers/legal-citations-ita/package.json mcp-servers/legal-citations-ita/
COPY --from=builder /app/mcp-servers/legal-persona-ita/dist mcp-servers/legal-persona-ita/dist
COPY --from=builder /app/mcp-servers/legal-persona-ita/package.json mcp-servers/legal-persona-ita/
COPY --from=builder /app/mcp-servers-http/dist mcp-servers-http/dist
COPY --from=builder /app/mcp-servers-http/package.json mcp-servers-http/

# Install production dependencies only
RUN npm ci --omit=dev

ENV NODE_ENV=production
# Railway sets PORT env var; default to 8080
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Start the aggregator
CMD ["node", "mcp-servers-http/dist/index.js"]
