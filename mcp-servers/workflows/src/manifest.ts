import type { AgentManifestEntry } from './validate.js';

/**
 * I 16 agenti chainable del plugin italiano (bettercallclaude_italia/agents/*.md).
 * Esclusi by design: orchestrator (il motore dei workflow stesso), summarizer
 * (post-processor aggiunto automaticamente), briefing (pre-esecuzione),
 * prompt-engineer (meta), chronology-builder (worker interno della skill
 * legal-chronology).
 *
 * Mapping server MCP rispetto al plugin svizzero:
 * bge-search, entscheidsuche → cassazione; fedlex-sparql → normattiva;
 * legal-citations → legal-citations-ita.
 * L'agente `cantonal` svizzero è diventato `regional` (diritto regionale).
 */
export const AGENTS_MANIFEST: AgentManifestEntry[] = [
  {
    agent_id: 'researcher',
    display_name: 'Ricercatore Giuridico Italiano',
    input_types: ['raw_query', 'case_facts'],
    output_types: ['research_memo', 'citations'],
    mcp_servers: ['cassazione', 'normattiva'],
    is_terminal: false
  },
  {
    agent_id: 'strategist',
    display_name: 'Stratega Processuale',
    input_types: ['research_memo', 'case_facts'],
    output_types: ['strategy_memo', 'risk_assessment'],
    mcp_servers: ['cassazione'],
    is_terminal: false
  },
  {
    agent_id: 'risk',
    display_name: 'Analista del Rischio',
    input_types: [
      'research_memo', 'strategy_memo', 'case_facts',
      'corporate_analysis', 'realestate_analysis', 'fiscal_analysis',
      'compliance_report'
    ],
    output_types: ['risk_assessment'],
    mcp_servers: ['cassazione'],
    is_terminal: false
  },
  {
    agent_id: 'drafter',
    display_name: 'Redattore Giuridico Italiano',
    input_types: [
      'research_memo', 'strategy_memo', 'risk_assessment', 'compliance_report',
      'case_facts', 'judicial_synthesis', 'corporate_analysis',
      'realestate_analysis', 'citations'
    ],
    output_types: ['draft_document'],
    mcp_servers: ['legal-citations-ita'],
    is_terminal: true
  },
  {
    agent_id: 'compliance',
    display_name: 'Compliance Officer',
    input_types: [
      'case_facts', 'document_set', 'research_memo', 'draft_document',
      'corporate_analysis', 'realestate_analysis', 'fiscal_analysis'
    ],
    output_types: ['compliance_report', 'draft_document'],
    mcp_servers: ['cassazione'],
    is_terminal: false
  },
  {
    agent_id: 'corporate',
    display_name: 'Esperto Diritto Societario',
    input_types: ['case_facts', 'research_memo', 'compliance_report'],
    output_types: ['corporate_analysis'],
    mcp_servers: ['cassazione'],
    is_terminal: false
  },
  {
    agent_id: 'realestate',
    display_name: 'Esperto Diritto Immobiliare',
    input_types: ['case_facts', 'research_memo'],
    output_types: ['realestate_analysis'],
    mcp_servers: ['cassazione'],
    is_terminal: false
  },
  {
    agent_id: 'citation',
    display_name: 'Specialista Citazioni',
    input_types: ['draft_document', 'citations', 'research_memo'],
    output_types: ['citations', 'draft_document'],
    mcp_servers: ['legal-citations-ita'],
    is_terminal: false
  },
  {
    agent_id: 'fiscal',
    display_name: 'Esperto Diritto Fiscale',
    input_types: ['case_facts', 'research_memo'],
    output_types: ['fiscal_analysis'],
    mcp_servers: ['cassazione'],
    is_terminal: false
  },
  {
    agent_id: 'advocate',
    display_name: 'Avvocato Difensore',
    input_types: ['case_facts', 'research_memo'],
    output_types: ['arguments_for'],
    mcp_servers: ['cassazione'],
    is_terminal: false
  },
  {
    agent_id: 'adversary',
    display_name: 'Avvocato Avversario',
    input_types: ['case_facts', 'research_memo', 'arguments_for'],
    output_types: ['arguments_against'],
    mcp_servers: ['cassazione'],
    is_terminal: false
  },
  {
    agent_id: 'judicial',
    display_name: 'Analista Giudiziario',
    input_types: ['arguments_for', 'arguments_against'],
    output_types: ['judicial_synthesis', 'risk_assessment'],
    mcp_servers: ['cassazione'],
    is_terminal: true
  },
  {
    agent_id: 'translator',
    display_name: 'Traduttore Giuridico',
    input_types: ['draft_document', 'research_memo', 'citations'],
    output_types: ['translation'],
    mcp_servers: ['normattiva'],
    is_terminal: true
  },
  {
    agent_id: 'regional',
    display_name: 'Esperto Diritto Regionale',
    input_types: ['raw_query', 'case_facts', 'research_memo'],
    output_types: ['regional_analysis'],
    mcp_servers: ['cassazione'],
    is_terminal: false
  },
  {
    agent_id: 'procedure',
    display_name: 'Specialista di Procedura',
    input_types: ['case_facts', 'research_memo', 'strategy_memo'],
    output_types: ['procedure_analysis'],
    mcp_servers: ['cassazione'],
    is_terminal: false
  },
  {
    agent_id: 'data-protection',
    display_name: 'Specialista Protezione Dati',
    input_types: ['case_facts', 'document_set', 'research_memo'],
    output_types: ['dataprotection_analysis'],
    mcp_servers: ['cassazione'],
    is_terminal: false
  }
];
