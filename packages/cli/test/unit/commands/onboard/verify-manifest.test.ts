import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../../../src/commands/onboard/verify/manifest';

function valid(overrides: object = {}) {
  return JSON.stringify({
    checks: [{ path: '/' }],
    ...overrides,
  });
}

describe('verify manifest', () => {
  it('parses "proves" milestones on a check', () => {
    const parsed = parseManifest(
      JSON.stringify({
        checks: [
          {
            path: '/api/todos',
            proves: ['read-verified', 'seed-imported'],
          },
        ],
      })
    );
    if (!parsed.ok) throw new Error(parsed.errors.join(', '));
    expect(parsed.manifest.checks[0].proves).toEqual([
      'read-verified',
      'seed-imported',
    ]);
  });

  it('rejects unknown "proves" values, naming the allowed set', () => {
    const parsed = parseManifest(
      JSON.stringify({
        checks: [{ path: '/', proves: ['database-migrated'] }],
      })
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors[0]).toContain('unknown "proves" value');
    expect(parsed.errors[0]).toContain('cross-request-persistence-verified');
  });

  it('parses a minimal manifest with defaults', () => {
    const parsed = parseManifest(valid());
    if (!parsed.ok) throw new Error(parsed.errors.join(', '));

    expect(parsed.manifest.checks).toEqual([
      {
        method: 'GET',
        path: '/',
        bodyIsJson: false,
        expect: { status: [200], bodyContains: [], notBodyContains: [] },
      },
    ]);
  });

  it('parses the full check shape', () => {
    const parsed = parseManifest(
      JSON.stringify({
        deployment: 'https://app.vercel.app',
        checks: [
          {
            method: 'post',
            path: '/api/todos',
            body: { title: 'x' },
            headers: { 'x-custom': '1' },
            expect: {
              status: [201, 200],
              bodyContains: 'title',
              notBodyContains: ['error'],
              contentType: 'application/json',
            },
            why: 'db write',
          },
        ],
      })
    );
    if (!parsed.ok) throw new Error(parsed.errors.join(', '));

    const check = parsed.manifest.checks[0];
    expect(check.method).toBe('POST');
    expect(check.body).toBe('{"title":"x"}');
    expect(check.bodyIsJson).toBe(true);
    expect(check.expect.status).toEqual([201, 200]);
    expect(check.expect.bodyContains).toEqual(['title']);
    expect(check.why).toBe('db write');
  });

  it('names the field on every error, for one-round-trip correction', () => {
    const parsed = parseManifest(
      JSON.stringify({
        checks: [
          { path: 'no-slash' },
          { path: '/', expects: { status: 200 } },
          { path: '/', expect: { status: 999 } },
        ],
      })
    );
    if (parsed.ok) throw new Error('expected errors');

    expect(parsed.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('checks[0]: "path"'),
        expect.stringContaining('checks[1]: unknown field "expects"'),
        expect.stringContaining('checks[2]: "expect.status"'),
      ])
    );
  });

  it('rejects non-JSON with the parser message', () => {
    const parsed = parseManifest('{ checks: [ ');
    if (parsed.ok) throw new Error('expected errors');
    expect(parsed.errors[0]).toContain('not valid JSON');
  });

  it('rejects an empty check list', () => {
    const parsed = parseManifest(JSON.stringify({ checks: [] }));
    if (parsed.ok) throw new Error('expected errors');
    expect(parsed.errors[0]).toContain('non-empty');
  });
});
