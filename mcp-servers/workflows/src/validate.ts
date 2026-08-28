import type { PipelineStep } from './types.js';

export interface AgentManifestEntry {
  agent_id: string;
  display_name: string;
  input_types: string[];
  output_types: string[];
  mcp_servers: string[];
  is_terminal: boolean;
}

export type ValidationErrorCode =
  | 'unknown_agent'
  | 'incompatible_chaining'
  | 'non_sequential_steps';

export interface ValidationError {
  code: ValidationErrorCode;
  step?: number;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export function validatePipeline(
  pipeline: PipelineStep[],
  manifest: AgentManifestEntry[]
): ValidationResult {
  const errors: ValidationError[] = [];
  const byId = new Map(manifest.map(a => [a.agent_id, a]));

  pipeline.forEach((s, i) => {
    if (s.step !== i + 1) {
      errors.push({
        code: 'non_sequential_steps',
        step: s.step,
        message: `Gli step devono essere numerati in sequenza: atteso step ${i + 1}, ricevuto ${s.step}`
      });
    }
    if (!byId.has(s.agent_id)) {
      errors.push({
        code: 'unknown_agent',
        step: s.step,
        message: `Agente sconosciuto '${s.agent_id}' — non presente nel manifest degli agenti del plugin italiano`
      });
    }
  });

  for (let i = 0; i < pipeline.length - 1; i++) {
    const from = byId.get(pipeline[i]!.agent_id);
    const to = byId.get(pipeline[i + 1]!.agent_id);
    if (!from || !to) continue; // unknown_agent già segnalato
    const compatible = from.output_types.some(t => to.input_types.includes(t));
    if (!compatible) {
      errors.push({
        code: 'incompatible_chaining',
        step: pipeline[i + 1]!.step,
        message:
          `'${from.agent_id}' produce [${from.output_types.join(', ')}], ` +
          `nessuno dei quali è accettato da '${to.agent_id}' [${to.input_types.join(', ')}]`
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
