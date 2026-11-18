import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import {
  ENDPOINT_URL,
  expectTeamScoped,
  run,
  savedConfig,
  stderr,
  stderrJson,
  stdoutJson,
  useInferenceHooksApi,
} from './inference-hooks-helpers';

function useRemovable() {
  return useInferenceHooksApi({
    getConfig: () => ({ body: savedConfig }),
    deleteConfig: () => ({ status: 204 }),
  });
}

describe('ai-gateway inference-hooks remove', () => {
  it('removes after confirming, previewing the target', async () => {
    const requests = useRemovable();

    const exitCode = run('remove');
    await expect(client.stderr).toOutput(
      'Remove the inference hooks configuration?'
    );
    client.stdin.write('y\n');

    expect(await exitCode).toBe(0);
    expect(stderr()).toContain(ENDPOINT_URL);
    expect(stderr()).toContain('The signing secret is kept.');
    expect(stderr()).toMatch(/Removed\s+inference hooks/);
    expect(requests.map(r => r.method)).toEqual(['GET', 'DELETE']);
    expectTeamScoped(requests);
  });

  it('changes nothing when the prompt is declined', async () => {
    const requests = useRemovable();

    const exitCode = run('rm');
    await expect(client.stderr).toOutput(
      'Remove the inference hooks configuration?'
    );
    client.stdin.write('n\n');

    expect(await exitCode).toBe(130);
    expect(stderr()).toContain('Canceled. Nothing was changed.');
    expect(requests.some(r => r.method === 'DELETE')).toBe(false);
  });

  it('needs --yes without a terminal', async () => {
    client.stdin.isTTY = false;
    const requests = useRemovable();

    expect(await run('remove')).toBe(2);

    expect(stderr()).toContain(
      "Can't remove the inference hooks configuration without confirmation in non-interactive mode."
    );
    expect(requests.some(r => r.method === 'DELETE')).toBe(false);
  });

  it('needs --yes with --json, and says why', async () => {
    const requests = useRemovable();

    expect(await run('remove', '--json')).toBe(2);

    const error = stderrJson();
    expect(error).toMatchObject({
      status: 'action_required',
      reason: 'confirmation_required',
      userActionRequired: true,
      data: {
        effects: [
          'Remove the inference hooks configuration',
          'Delete 1 stored header',
        ],
      },
    });
    expect(error.next[0].command).toContain('--yes');
    expect(requests.some(r => r.method === 'DELETE')).toBe(false);
  });

  it('removes with --yes', async () => {
    const requests = useRemovable();

    expect(await run('rm', '--yes', '--json')).toBe(0);

    expect(stdoutJson()).toMatchObject({
      inferenceHooks: { configured: false },
      outcome: 'removed',
      next: [{ command: 'vercel ai-gateway inference-hooks status' }],
    });
    expect(requests.filter(r => r.method === 'DELETE')).toHaveLength(1);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:inference-hooks', value: 'inference-hooks' },
      { key: 'subcommand:remove', value: 'rm' },
      { key: 'flag:yes', value: 'TRUE' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('is a no-op when nothing is set up', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => ({ body: { configured: false } }),
    });

    expect(await run('remove', '--json')).toBe(0);

    expect(stdoutJson().outcome).toBe('unchanged');
    expect(requests.map(r => r.method)).toEqual(['GET']);
  });

  it('does not retry a delete that failed with a 5xx', async () => {
    const requests = useInferenceHooksApi({
      getConfig: () => ({ body: savedConfig }),
      deleteConfig: () => ({ status: 500, body: { error: { message: 'x' } } }),
    });

    expect(await run('remove', '--yes', '--json')).toBe(1);

    expect(requests.filter(r => r.method === 'DELETE')).toHaveLength(1);
    expect(stderrJson().reason).toBe('unknown_outcome');
  });
});
