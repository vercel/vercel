import { describe, expect, it } from 'vitest';
import aiGateway from '../../../../src/commands/ai-gateway';
import { aiGatewayCommand } from '../../../../src/commands/ai-gateway/command';
import { handleUnexpectedError } from '../../../../src/commands/ai-gateway/inference-hooks-shared';
import { client } from '../../../mocks/client';
import {
  run,
  stderr,
  stderrJson,
  useInferenceHooksApi,
} from './inference-hooks-helpers';

describe('ai-gateway inference-hooks', () => {
  it('is hidden from help', () => {
    const group = aiGatewayCommand.subcommands.find(
      command => command.name === 'inference-hooks'
    );
    expect(group).toMatchObject({ hidden: true });
  });

  it('rejects an unknown subcommand', async () => {
    expect(await run('frobnicate')).toBe(2);
    expect(stderr()).toContain('Unknown command frobnicate');
  });

  it('rejects an unknown signing-secret subcommand', async () => {
    expect(await run('signing-secret', 'reveal')).toBe(2);
    expect(stderr()).toContain('Unknown command reveal');
  });

  it('rejects an unknown option before any request', async () => {
    const requests = useInferenceHooksApi({});
    expect(await run('status', '--frobnicate')).toBe(2);
    expect(requests).toEqual([]);
  });

  it('fails without a team in JSON mode instead of prompting', async () => {
    const requests = useInferenceHooksApi({});
    client.setArgv('ai-gateway', 'inference-hooks', 'status', '--json');

    expect(await aiGateway(client)).toBe(2);

    expect(stderrJson()).toMatchObject({
      status: 'action_required',
      reason: 'missing_scope',
    });
    expect(requests).toEqual([]);
  });

  it('reports a network failure as a JSON error', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    expect(handleUnexpectedError(client, true, err)).toBe(1);
    expect(stderrJson()).toMatchObject({
      status: 'error',
      reason: 'network_error',
    });
  });
});
