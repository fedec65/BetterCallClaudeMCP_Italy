import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getPool, ensureSchema } from './db.js';
import {
  listAgents, validatePipelineTool, saveWorkflow, listWorkflows,
  getWorkflow, deleteWorkflow, logRun, claimUserId, WorkflowValidationError
} from './tools.js';
import {
  SaveWorkflowInputSchema, ListWorkflowsInputSchema, GetWorkflowInputSchema,
  DeleteWorkflowInputSchema, LogRunInputSchema, ValidatePipelineInputSchema,
  ClaimUserIdInputSchema
} from './types.js';

const PIPELINE_STEP = {
  type: 'object',
  properties: {
    step: { type: 'integer', minimum: 1 },
    agent_id: { type: 'string', description: 'Uno degli agent_id restituiti da list_agents' },
    purpose: { type: 'string' },
    checkpoint: { type: 'boolean', description: 'Pausa per conferma utente dopo questo step' }
  },
  required: ['step', 'agent_id', 'purpose']
} as const;

const USER_ID = {
  type: 'string',
  description: 'Identificativo stabile del chiamante (impostazione user_id del plugin; auto-dichiarato)'
} as const;

export function createWorkflowsItaServer(): Server {
  const server = new Server(
    { name: 'workflows-ita', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'list_agents',
        description:
          'Elenca gli agenti del plugin italiano disponibili per le pipeline di workflow personalizzati, con i tipi di dato che ciascuno accetta in input e produce in output.',
        annotations: { readOnlyHint: true, destructiveHint: false },
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'validate_pipeline',
        description:
          'Valida una pipeline di workflow senza salvarla: verifica che ogni agente esista nel manifest italiano e che gli step consecutivi abbiano tipi output/input compatibili. Restituisce {valid, errors}.',
        annotations: { readOnlyHint: true, destructiveHint: false },
        inputSchema: {
          type: 'object',
          properties: { pipeline: { type: 'array', items: PIPELINE_STEP, minItems: 1 } },
          required: ['pipeline']
        }
      },
      {
        name: 'save_workflow',
        description:
          'Valida e salva (upsert su user_id+slug) un workflow personalizzato riutilizzabile. Fallisce con gli errori di validazione se la pipeline non è valida.',
        annotations: { readOnlyHint: false, destructiveHint: false },
        inputSchema: {
          type: 'object',
          properties: {
            user_id: USER_ID,
            slug: { type: 'string', description: 'identificativo kebab-case, univoco per utente' },
            name: { type: 'string' },
            description: { type: 'string' },
            pipeline: { type: 'array', items: PIPELINE_STEP, minItems: 1 },
            output_spec: { type: 'string', description: 'Cosa deve produrre lo step finale' },
            visibility: { type: 'string', enum: ['private', 'team', 'public'], default: 'private' }
          },
          required: ['user_id', 'slug', 'name', 'description', 'pipeline', 'output_spec']
        }
      },
      {
        name: 'list_workflows',
        description:
          'Elenca i workflow personalizzati salvati dal chiamante (opzionalmente includendo quelli team/public).',
        annotations: { readOnlyHint: true, destructiveHint: false },
        inputSchema: {
          type: 'object',
          properties: {
            user_id: USER_ID,
            include_team: { type: 'boolean', default: false },
            include_public: { type: 'boolean', default: false }
          },
          required: ['user_id']
        }
      },
      {
        name: 'get_workflow',
        description: 'Recupera la definizione completa di un workflow salvato (proprio, team o public).',
        annotations: { readOnlyHint: true, destructiveHint: false },
        inputSchema: {
          type: 'object',
          properties: { user_id: USER_ID, slug: { type: 'string' } },
          required: ['user_id', 'slug']
        }
      },
      {
        name: 'delete_workflow',
        description: 'Elimina uno dei workflow del chiamante (solo proprietario).',
        annotations: { readOnlyHint: false, destructiveHint: true },
        inputSchema: {
          type: 'object',
          properties: { user_id: USER_ID, slug: { type: 'string' } },
          required: ['user_id', 'slug']
        }
      },
      {
        name: 'claim_user_id',
        description: 'Riserva un namespace user_id. Restituisce claimed:true se assegnato a te, false se già occupato.',
        annotations: { readOnlyHint: false, destructiveHint: false },
        inputSchema: {
          type: 'object',
          properties: { user_id: USER_ID },
          required: ['user_id']
        }
      },
      {
        name: 'log_run',
        description: 'Registra un\'esecuzione di workflow nell\'audit trail (workflow_runs).',
        annotations: { readOnlyHint: false, destructiveHint: false },
        inputSchema: {
          type: 'object',
          properties: {
            workflow_id: { type: 'string', format: 'uuid' },
            user_id: USER_ID,
            status: { type: 'string', enum: ['running', 'completed', 'failed', 'abandoned'] },
            output_summary: { type: 'string' }
          },
          required: ['workflow_id', 'user_id', 'status']
        }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      // Valida gli argomenti al confine PRIMA di qualsiasi accesso al DB, così
      // l'input invalido restituisce un envelope di errore zod anche quando
      // DATABASE_URL non è impostata.
      switch (name) {
        case 'list_agents': {
          await ensureSchema();
          const pool = getPool();
          return json(await listAgents(pool));
        }
        case 'validate_pipeline': {
          const input = ValidatePipelineInputSchema.parse(args);
          await ensureSchema();
          return json(await validatePipelineTool(getPool(), input));
        }
        case 'save_workflow': {
          const input = SaveWorkflowInputSchema.parse(args);
          await ensureSchema();
          return json(await saveWorkflow(getPool(), input));
        }
        case 'list_workflows': {
          const input = ListWorkflowsInputSchema.parse(args);
          await ensureSchema();
          return json(await listWorkflows(getPool(), input));
        }
        case 'get_workflow': {
          const input = GetWorkflowInputSchema.parse(args);
          await ensureSchema();
          const row = await getWorkflow(getPool(), input);
          if (!row) throw new Error('Workflow non trovato (o non visibile a questo user_id)');
          return json(row);
        }
        case 'delete_workflow': {
          const input = DeleteWorkflowInputSchema.parse(args);
          await ensureSchema();
          return json(await deleteWorkflow(getPool(), input));
        }
        case 'log_run': {
          const input = LogRunInputSchema.parse(args);
          await ensureSchema();
          return json(await logRun(getPool(), input));
        }
        case 'claim_user_id': {
          const input = ClaimUserIdInputSchema.parse(args);
          await ensureSchema();
          return json(await claimUserId(getPool(), input));
        }
        default:
          throw new Error(`Tool sconosciuto: ${name}`);
      }
    } catch (error) {
      const payload =
        error instanceof WorkflowValidationError
          ? { valid: false, errors: error.errors }
          : error instanceof z.ZodError
            ? { error: 'invalid_input', issues: error.issues }
            : { error: error instanceof Error ? error.message : String(error) };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], isError: true };
    }
  });

  return server;
}

function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}
