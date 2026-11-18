import { describe, expect, it } from 'vitest';
import { TEAM_NOT_CHOSEN } from '../../../../src/util/client';
import { APIError } from '../../../../src/util/errors-ts';
import { createTeam, useTeam } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import aiGateway from '../../../../src/commands/ai-gateway';
import { aiGatewayCommand } from '../../../../src/commands/ai-gateway/command';
import {
  handleApiError,
  handleUnexpectedError,
} from '../../../../src/commands/ai-gateway/inference-hooks-shared';
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

  it('fails with missing_scope in an agent run with several teams', async () => {
    useTeam('team_first');
    createTeam('team_other');
    useUser({ version: 'northstar' });
    client.isAgent = true;
    client.nonInteractive = true;
    client.ignoresSavedTeam = true;
    client.config.currentTeam = TEAM_NOT_CHOSEN;
    const requests = useInferenceHooksApi({});
    client.setArgv('ai-gateway', 'inference-hooks', 'status', '--json');

    expect(await aiGateway(client)).toBe(2);

    expect(client.stdout.getFullOutput()).toBe('');
    expect(stderrJson()).toMatchObject({
      status: 'action_required',
      reason: 'missing_scope',
    });
    expect(requests).toEqual([]);
  });

  it('says nothing changed when a write never connected', () => {
    const err = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ECONNREFUSED' },
    });
    expect(
      handleApiError(client, true, err, {
        action: 'save the inference hooks configuration',
        unknownOutcome: 'the inference hooks configuration was saved',
      })
    ).toBe(1);
    expect(stderrJson()).toMatchObject({
      reason: 'network_error',
      message: expect.stringContaining('Nothing was changed.'),
    });
  });

  it('reports an unknown outcome when a sent write lost its connection', () => {
    const err = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ECONNRESET' },
    });
    expect(
      handleApiError(client, true, err, {
        action: 'save the inference hooks configuration',
        unknownOutcome: 'the inference hooks configuration was saved',
      })
    ).toBe(1);
    expect(stderrJson()).toMatchObject({
      reason: 'unknown_outcome',
      message:
        "Can't confirm whether the inference hooks configuration was saved. The connection failed before a response arrived.",
      next: [{ command: 'vercel ai-gateway inference-hooks status' }],
      retryable: false,
    });
  });

  it('says only that AI Gateway is not set up on a missing record', () => {
    const err = Object.assign(
      new APIError('not found', new Response(null, { status: 404 })),
      { code: 'customer_info_not_found' }
    );
    expect(
      handleApiError(client, false, err, {
        action: 'save the inference hooks configuration',
      })
    ).toBe(1);
    const text = client.stderr.getFullOutput();
    expect(text).toContain("AI Gateway isn't set up for this team yet.");
    expect(text).not.toContain('dashboard');
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
