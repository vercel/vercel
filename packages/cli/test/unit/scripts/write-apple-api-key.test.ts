import { describe, expect, it } from 'vitest';
import { resolveAppleApiKeyJson } from '../../../scripts/write-apple-api-key.mjs';

const json =
  '{"key_id":"ABC123","issuer_id":"11111111-1111-1111-1111-111111111111"}';

describe('resolveAppleApiKeyJson()', () => {
  it('accepts raw JSON', () => {
    expect(resolveAppleApiKeyJson(`\n${json}\n`)).toBe(json);
  });

  it('accepts base64-encoded JSON', () => {
    expect(
      resolveAppleApiKeyJson(Buffer.from(json, 'utf8').toString('base64'))
    ).toBe(json);
  });

  it('rejects an empty secret', () => {
    expect(() => resolveAppleApiKeyJson('')).toThrow(/empty or unavailable/);
  });

  it('rejects a non-JSON payload', () => {
    expect(() => resolveAppleApiKeyJson('-----BEGIN PRIVATE KEY-----')).toThrow(
      /neither JSON nor base64-encoded JSON/
    );
  });
});
