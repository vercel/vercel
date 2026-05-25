import { describe, it, expect, vi } from 'vitest';
import { resolveSubcommandWithOpenApi } from '../../../../src/util/openapi/resolve-subcommand-with-openapi';

const config = {
  list: ['list', 'ls'],
  inspect: ['inspect'],
};

describe('resolveSubcommandWithOpenApi', () => {
  it('prefers a native subcommand when the token matches', async () => {
    const r = await resolveSubcommandWithOpenApi(
      ['list'],
      config,
      async () => 'projects'
    );
    expect(r.kind).toBe('native');
    if (r.kind === 'native') {
      expect(r.subcommand).toBe('list');
      expect(r.subcommandOriginal).toBe('list');
    }
  });

  it('returns openapi when the token is not native and a tag resolves', async () => {
    const r = await resolveSubcommandWithOpenApi(
      ['getProject'],
      config,
      async () => 'projects'
    );
    expect(r.kind).toBe('openapi');
    if (r.kind === 'openapi') {
      expect(r.tag).toBe('projects');
      expect(r.operationId).toBe('getProject');
      expect(r.positionalRest).toEqual([]);
    }
  });

  it('returns unmatched when no tag is available', async () => {
    const r = await resolveSubcommandWithOpenApi(
      ['getProject'],
      config,
      async () => null
    );
    expect(r.kind).toBe('unmatched');
  });

  it('returns unmatched for flag-like first tokens without consulting openapi', async () => {
    const tagSpy = vi.fn(async () => 'projects');
    const r = await resolveSubcommandWithOpenApi(['--foo'], config, tagSpy);
    expect(r.kind).toBe('unmatched');
    expect(tagSpy).not.toHaveBeenCalled();
  });
});
