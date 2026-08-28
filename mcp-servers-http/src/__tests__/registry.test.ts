import { describe, it, expect } from 'vitest';
import { listServers, hasServer, getServerFactory } from '../server-registry.js';

describe('Server Registry', () => {
  it('lists all 9 servers', () => {
    const servers = listServers();
    expect(servers.length).toBe(9);
    expect(servers.map((s) => s.name)).toContain('normattiva');
    expect(servers.map((s) => s.name)).toContain('eur-lex-ita');
    expect(servers.map((s) => s.name)).toContain('citation-verify-ita');
    expect(servers.map((s) => s.name)).toContain('workflows-ita');
  });

  it('has normattiva server', () => {
    expect(hasServer('normattiva')).toBe(true);
  });

  it('returns factory for normattiva', () => {
    const factory = getServerFactory('normattiva');
    expect(factory).toBeDefined();
  });

  it('returns undefined for unknown server', () => {
    expect(getServerFactory('unknown')).toBeUndefined();
  });
});
