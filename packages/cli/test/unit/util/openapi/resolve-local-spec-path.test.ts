import { describe, expect, it } from 'vitest';
import { resolveLocalOpenApiPath } from '../../../../src/util/openapi/resolve-local-spec-path';

describe('resolveLocalOpenApiPath', () => {
  it('resolves ~/ to home', () => {
    const r = resolveLocalOpenApiPath('~/foo/bar.json');
    expect(r).toMatch(/foo[/\\]bar\.json$/);
    expect(r).not.toContain('~');
  });

  it('passes through absolute paths', () => {
    expect(resolveLocalOpenApiPath('/tmp/openapi.json')).toBe(
      '/tmp/openapi.json'
    );
  });
});
