import { describe, it, expect } from 'vitest';
import { CheckExistenceInputSchema } from '../types.js';

describe('Citation Verify types', () => {
  it('validates minimal input', () => {
    const result = CheckExistenceInputSchema.safeParse({ citazione: 'Cass. n. 12345/2024' });
    expect(result.success).toBe(true);
  });

  it('validates input with italgiure_cookie', () => {
    const result = CheckExistenceInputSchema.safeParse({
      citazione: 'D.Lgs. 231/2001',
      italgiure_cookie: 'ASPSESSIONID=test',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty citazione', () => {
    const result = CheckExistenceInputSchema.safeParse({ citazione: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing citazione', () => {
    const result = CheckExistenceInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
