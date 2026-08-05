import { describe, expect, it } from 'vitest';
import { classifyGatedOperation } from '../../../../src/util/ship-session/classify';

describe('ship session gate classifier', () => {
  it('gates a production deploy', () => {
    expect(classifyGatedOperation('deploy', ['deploy', '--prod'])?.gate).toBe(
      'production'
    );
    expect(
      classifyGatedOperation('deploy', ['deploy', '--target', 'production'])
        ?.gate
    ).toBe('production');
    expect(
      classifyGatedOperation('deploy', ['deploy', '--target=production'])?.gate
    ).toBe('production');
    // Bare `vercel --prod` dispatches as deploy with no command token.
    expect(classifyGatedOperation('deploy', ['--prod'])?.gate).toBe(
      'production'
    );
  });

  it('leaves preview deploys ungated — they are the core loop', () => {
    expect(classifyGatedOperation('deploy', ['deploy'])).toBeUndefined();
    expect(
      classifyGatedOperation('deploy', [
        'deploy',
        '--prebuilt',
        '--format',
        'json',
      ])
    ).toBeUndefined();
    // A staging target is not production.
    expect(
      classifyGatedOperation('deploy', ['deploy', '--target', 'staging'])
    ).toBeUndefined();
  });

  it('gates provisioning and purchases as spend', () => {
    expect(
      classifyGatedOperation('integration', [
        'integration',
        'add',
        'neon',
        '--name',
        'todo-db',
      ])?.gate
    ).toBe('spend');
    expect(
      classifyGatedOperation('domains', ['domains', 'buy', 'example.com'])?.gate
    ).toBe('spend');
  });

  it('gates remote deletes', () => {
    expect(
      classifyGatedOperation('project', ['project', 'rm', 'my-app'])?.gate
    ).toBe('remote-delete');
    expect(
      classifyGatedOperation('integration-resource', [
        'integration-resource',
        'remove',
        'todo-db',
        '--disconnect-all',
        '--yes',
      ])?.gate
    ).toBe('remote-delete');
  });

  it('resolves the subcommand through aliases', () => {
    expect(
      classifyGatedOperation('project', ['projects', 'rm', 'my-app'])?.gate
    ).toBe('remote-delete');
  });

  it('is not fooled by flag values that look like subcommands', () => {
    // `--scope` takes a value; the subcommand is anchored to the command token.
    expect(
      classifyGatedOperation('integration', [
        '--scope',
        'add',
        'integration',
        'ls',
      ])
    ).toBeUndefined();
  });

  it('never gates a help invocation', () => {
    expect(
      classifyGatedOperation('project', ['project', 'rm', '--help'])
    ).toBeUndefined();
    expect(
      classifyGatedOperation('deploy', ['deploy', '--prod', '-h'])
    ).toBeUndefined();
    expect(
      classifyGatedOperation('integration', ['integration', 'add', '-h'])
    ).toBeUndefined();
  });

  it('leaves everything else alone', () => {
    expect(classifyGatedOperation('ls', ['ls'])).toBeUndefined();
    expect(classifyGatedOperation('env', ['env', 'pull'])).toBeUndefined();
    expect(
      classifyGatedOperation('integration', ['integration', 'ls'])
    ).toBeUndefined();
    expect(
      classifyGatedOperation('integration-resource', [
        'integration-resource',
        'connect',
        'todo-db',
        'my-app',
      ])
    ).toBeUndefined();
  });
});
