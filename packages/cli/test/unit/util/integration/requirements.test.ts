import { describe, expect, it } from 'vitest';
import { parseIntegrationRequirements } from '../../../../src/util/integration/requirements';

describe('parseIntegrationRequirements', () => {
  it('parses a flat array of slugs', () => {
    const result = parseIntegrationRequirements({
      integrations: ['neon', 'supabase'],
    });

    expect(result.errors).toEqual([]);
    expect(result.slugs).toEqual(['neon', 'supabase']);
  });

  it('deduplicates slugs', () => {
    const result = parseIntegrationRequirements({
      integrations: ['neon', 'Neon', 'supabase'],
    });

    expect(result.errors).toEqual([]);
    expect(result.slugs).toEqual(['neon', 'supabase']);
  });

  it('returns empty slugs when integrations is undefined', () => {
    const result = parseIntegrationRequirements({});

    expect(result.errors).toEqual([]);
    expect(result.slugs).toEqual([]);
  });

  it('returns empty slugs for null config', () => {
    const result = parseIntegrationRequirements(null);

    expect(result.errors).toEqual([]);
    expect(result.slugs).toEqual([]);
  });

  it('returns an error when integrations is not an array', () => {
    const result = parseIntegrationRequirements({
      integrations: { storage: ['postgres'] } as unknown as string[],
    });

    expect(result.errors).toContain(
      'Expected "integrations" to be an array of strings.'
    );
    expect(result.slugs).toEqual([]);
  });

  it('returns errors for non-string or empty entries', () => {
    const result = parseIntegrationRequirements({
      integrations: ['neon', '', 42 as unknown as string],
    });

    expect(result.slugs).toEqual(['neon']);
    expect(result.errors).toEqual([
      'Expected "integrations" to contain non-empty strings.',
      'Expected "integrations" to contain non-empty strings.',
    ]);
  });
});
