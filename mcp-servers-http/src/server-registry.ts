import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

export type ServerFactory = () => Server;

interface RegisteredServer {
  name: string;
  description: string;
  factory: ServerFactory;
}

const registry = new Map<string, RegisteredServer>();

export function registerServer(
  pathName: string,
  name: string,
  description: string,
  factory: ServerFactory
): void {
  registry.set(pathName, { name, description, factory });
}

export function getServerFactory(pathName: string): ServerFactory | undefined {
  return registry.get(pathName)?.factory;
}

export function listServers(): Array<{
  path: string;
  name: string;
  description: string;
}> {
  return Array.from(registry.entries()).map(([path, info]) => ({
    path,
    name: info.name,
    description: info.description,
  }));
}

export function hasServer(pathName: string): boolean {
  return registry.has(pathName);
}

// Register all servers
import { createNormattivaServer } from '@bettercallclaude-italia/normattiva';
registerServer('normattiva', 'normattiva', 'Legislazione italiana (Normattiva)', createNormattivaServer);

import { createCorteCostituzionaleServer } from '@bettercallclaude-italia/corte-costituzionale';
registerServer('corte-costituzionale', 'corte-costituzionale', 'Sentenze Corte Costituzionale', createCorteCostituzionaleServer);

import { createGiustiziaAmministrativaServer } from '@bettercallclaude-italia/giustizia-amministrativa';
registerServer('giustizia-amministrativa', 'giustizia-amministrativa', 'TAR e Consiglio di Stato', createGiustiziaAmministrativaServer);

import { createCassazioneServer } from '@bettercallclaude-italia/cassazione';
registerServer('cassazione', 'cassazione', 'Giurisprudenza Corte di Cassazione', createCassazioneServer);

import { createEurLexItaServer } from '@bettercallclaude-italia/eur-lex-ita';
registerServer('eur-lex-ita', 'eur-lex-ita', 'Diritto UE in lingua italiana', createEurLexItaServer);

import { createLegalCitationsItaServer } from '@bettercallclaude-italia/legal-citations-ita';
registerServer('legal-citations-ita', 'legal-citations-ita', 'Validazione citazioni normative italiane', createLegalCitationsItaServer);

import { createLegalPersonaItaServer } from '@bettercallclaude-italia/legal-persona-ita';
registerServer('legal-persona-ita', 'legal-persona-ita', 'Drafting documenti giuridici italiani', createLegalPersonaItaServer);

import { createCitationVerifyItaServer } from '@bettercallclaude-italia/citation-verify-ita';
registerServer('citation-verify-ita', 'citation-verify-ita', 'Verifica esistenza citazioni giuridiche italiane', createCitationVerifyItaServer);
