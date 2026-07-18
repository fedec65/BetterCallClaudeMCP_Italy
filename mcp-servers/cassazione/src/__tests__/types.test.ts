import { describe, it, expect } from 'vitest';
import { SearchMassimeInputSchema, GetSentenzaInputSchema } from '../types.js';

describe('Cassazione types', () => {
  it('validates search input', () => {
    const result = SearchMassimeInputSchema.safeParse({ query: 'prova' });
    expect(result.success).toBe(true);
  });

  it('validates search input with cookie param', () => {
    const result = SearchMassimeInputSchema.safeParse({ query: 'prova', cookie: 'ASPSESSIONID=test' });
    expect(result.success).toBe(true);
  });

  it('validates get sentenza input', () => {
    const result = GetSentenzaInputSchema.safeParse({ id: '12345' });
    expect(result.success).toBe(true);
  });

  it('validates get sentenza input with cookie param', () => {
    const result = GetSentenzaInputSchema.safeParse({ id: '12345', cookie: 'ASPSESSIONID=test' });
    expect(result.success).toBe(true);
  });
});
