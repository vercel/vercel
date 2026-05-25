import { describe, expect, it } from 'vitest';
import { parsePatchBody } from '../../../../src/commands/edge-config/parse-patch-body';

describe('parsePatchBody', () => {
  it('parses compact JSON', () => {
    const body = parsePatchBody(
      '{"items":[{"operation":"upsert","key":"foo","value":true}]}'
    );
    expect(body.items).toEqual([
      { operation: 'upsert', key: 'foo', value: true },
    ]);
  });

  it('parses JSON with real newlines between tokens', () => {
    const body = parsePatchBody(`{"items":[
      {"operation":"upsert","key":"a","value":1}
    ]}`);
    expect(body.items).toHaveLength(1);
  });

  it('accepts literal backslash-n from argv (e.g. pnpm passing multiline --patch)', () => {
    const raw =
      '{"items":[\\n    {"operation":"upsert","key":"foo","value":true},\\n    {"operation":"upsert","key":"bar","value":false}\\n  ]}';
    const body = parsePatchBody(raw);
    expect(body.items).toEqual([
      { operation: 'upsert', key: 'foo', value: true },
      { operation: 'upsert', key: 'bar', value: false },
    ]);
  });

  it('accepts bare array with literal \\n', () => {
    const raw = '[\\n  {"operation":"upsert","key":"k","value":"v"}\\n]';
    const body = parsePatchBody(raw);
    expect(body.items).toEqual([{ operation: 'upsert', key: 'k', value: 'v' }]);
  });

  it('throws on invalid JSON with no recoverable escapes', () => {
    expect(() => parsePatchBody('{not json')).toThrow(SyntaxError);
  });
});
