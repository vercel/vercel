import { describe, expect, it } from 'vitest';
import { parseConfigFlag } from '../../../../src/util/ai-gateway/virtual-models';

describe('parseConfigFlag', () => {
  it('parses a valid object', () => {
    const result = parseConfigFlag('{"sort":"cost"}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ sort: 'cost' });
  });

  it('rejects non-JSON', () => {
    const result = parseConfigFlag('{nope');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('must be valid JSON');
  });

  it('rejects a non-object', () => {
    const result = parseConfigFlag('["cost"]');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('must be a JSON object');
  });

  it('names an unknown scalar field without the provider-options hint', () => {
    const result = parseConfigFlag('{"sor":"cost"}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Unknown field: sor');
      expect(result.error).not.toContain('provider options');
    }
  });

  it('suggests the providerOptions wrapper for an unknown object-valued field', () => {
    const result = parseConfigFlag('{"anthropic":{"effort":"high"}}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Unknown field: anthropic');
      expect(result.error).toContain(
        'wrap it as { "providerOptions": { "anthropic": { ... } } }'
      );
    }
  });

  it('rejects an invalid enum value with the valid list', () => {
    const result = parseConfigFlag('{"sort":"nope"}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(
        'Invalid sort: "nope". Valid values are: @default, cost, ttft, tps, price, latency, throughput.'
      );
    }
  });

  it('accepts enum synonyms and the @default sentinel', () => {
    expect(parseConfigFlag('{"sort":"price"}').ok).toBe(true);
    expect(parseConfigFlag('{"serviceTier":"@default"}').ok).toBe(true);
    expect(parseConfigFlag('{"caching":"@default"}').ok).toBe(true);
    expect(parseConfigFlag('{"speed":"fast"}').ok).toBe(true);
  });

  it('rejects bad has entries and non-arrays', () => {
    const entry = parseConfigFlag('{"has":["vision","xray"]}');
    expect(entry.ok).toBe(false);
    if (!entry.ok) {
      expect(entry.error).toBe(
        'Invalid has entry: "xray". Valid values are: implicit-caching, vision.'
      );
    }
    const nonArray = parseConfigFlag('{"has":"vision"}');
    expect(nonArray.ok).toBe(false);
    if (!nonArray.ok) {
      expect(nonArray.error).toBe(
        'has must be an array of: implicit-caching, vision.'
      );
    }
    expect(parseConfigFlag('{"has":["implicit-caching","vision"]}').ok).toBe(
      true
    );
  });

  it('rejects non-boolean boolean fields', () => {
    const result = parseConfigFlag('{"zeroDataRetention":"yes"}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('zeroDataRetention must be true or false.');
    }
    expect(parseConfigFlag('{"zeroDataRetention":true}').ok).toBe(true);
  });

  it('accepts providerOptions as a record of per-provider objects', () => {
    const result = parseConfigFlag(
      '{"providerOptions":{"anthropic":{"effort":"high"}}}'
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        providerOptions: { anthropic: { effort: 'high' } },
      });
    }
  });

  it('rejects malformed providerOptions', () => {
    for (const raw of [
      '{"providerOptions":"anthropic"}',
      '{"providerOptions":{"anthropic":"high"}}',
      '{"providerOptions":["anthropic"]}',
    ]) {
      const result = parseConfigFlag(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(
          'providerOptions must be an object of per-provider objects'
        );
      }
    }
  });
});
