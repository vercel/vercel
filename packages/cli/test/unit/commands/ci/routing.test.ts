import { beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import ci from '../../../../src/commands/ci';

describe('CI argument errors', () => {
  beforeEach(() => {
    useUser();
    client.nonInteractive = true;
  });

  it.each([
    'enable',
    'ls',
    'inspect',
    'logs',
    'grep',
    'rerun',
  ])('reports an unknown %s flag as structured JSON', async subcommand => {
    client.setArgv('ci', subcommand, '--not-a-ci-option');
    expect(await ci(client)).toBe(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message: expect.stringContaining('--not-a-ci-option'),
    });
  });

  it.each([
    ['ls', '--branch'],
    ['inspect', '--attempt'],
    ['logs', '--task'],
    ['grep', '--runs'],
    ['rerun', '--team'],
    ['enable', '--format'],
    ['enable', '--remote'],
  ])('reports a missing value for %s %s as JSON', async (subcommand, flag) => {
    client.setArgv('ci', subcommand, flag);
    expect(await ci(client)).toBe(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message: expect.stringContaining(flag),
    });
  });

  it('reports malformed global flags through the parent router', async () => {
    client.setArgv('ci', 'ls', '--team');
    expect(await ci(client)).toBe(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message: expect.stringContaining('--team'),
    });
  });
});
