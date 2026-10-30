import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { createCiGitRepo, createCiInvocation } from '../../../mocks/ci';
import * as ciApi from '../../../../src/util/ci/api';
import {
  resolveAttemptNumber,
  resolveRunTarget,
} from '../../../../src/commands/ci/resolve-run';

const INVOCATION_ID = 'invo1_abc123';
const ATTEMPTS_PATH = '/v1/vercel-ci/invocations/:invocationId/attempts';

describe('CI run attempt resolution', () => {
  let sha: string;
  let listedAttempt: number;
  let requestedId: string | undefined;

  beforeEach(() => {
    useUser();
    const repo = createCiGitRepo();
    client.cwd = repo.cwd;
    client.setArgv('ci', 'logs');
    sha = repo.sha;
    listedAttempt = 1;
    requestedId = undefined;

    client.scenario.get('/v2/vercel-ci/invocations', (_req, res) => {
      res.json({
        invocations: [
          createCiInvocation({
            invocationId: INVOCATION_ID,
            commitSha: sha,
            attempt: listedAttempt,
          }),
        ],
        repositories: {},
        pagination: {},
      });
    });
    client.scenario.get(ATTEMPTS_PATH, (req, res) => {
      requestedId = req.params.invocationId;
      res.json({
        attempts: [1, 3, 2].map(attempt =>
          createCiInvocation({ invocationId: INVOCATION_ID, attempt })
        ),
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    1, 2,
  ])('fetches the true latest attempt for HEAD when the list returns attempt %s', async attempt => {
    listedAttempt = attempt;
    const latestAttempt = vi.spyOn(ciApi, 'getLatestCiAttempt');
    const target = await resolveRunTarget(client, undefined, undefined);
    if (typeof target === 'number') {
      throw new Error(`Run resolution failed with exit code ${target}`);
    }

    expect(target).toEqual({
      invocationId: INVOCATION_ID,
      attempt: undefined,
      accountId: undefined,
    });
    expect(await resolveAttemptNumber(client, target)).toBe(3);
    expect(latestAttempt).toHaveBeenCalledExactlyOnceWith(
      client,
      INVOCATION_ID,
      undefined
    );
    expect(requestedId).toBe(INVOCATION_ID);
  });

  it('fetches the latest attempt for an explicit run ID without listing runs', async () => {
    const list = vi.spyOn(ciApi, 'listCiInvocations');
    const target = await resolveRunTarget(client, 'abc123', undefined);
    if (typeof target === 'number') {
      throw new Error(`Run resolution failed with exit code ${target}`);
    }

    expect(await resolveAttemptNumber(client, target)).toBe(3);
    expect(requestedId).toBe(INVOCATION_ID);
    expect(list).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    'abc123',
  ])('honors an explicit attempt without fetching attempts (run ID: %s)', async runArg => {
    listedAttempt = 2;
    const latestAttempt = vi.spyOn(ciApi, 'getLatestCiAttempt');
    const target = await resolveRunTarget(client, runArg, 1);
    if (typeof target === 'number') {
      throw new Error(`Run resolution failed with exit code ${target}`);
    }

    expect(await resolveAttemptNumber(client, target)).toBe(1);
    expect(latestAttempt).not.toHaveBeenCalled();
    expect(requestedId).toBeUndefined();
  });

  it('preserves the resolved team when fetching the latest attempt', async () => {
    vi.spyOn(ciApi, 'resolveCiTeam').mockResolvedValue({
      ok: true,
      accountId: 'team_selected',
    });
    const latestAttempt = vi
      .spyOn(ciApi, 'getLatestCiAttempt')
      .mockResolvedValue(3);
    const target = await resolveRunTarget(client, undefined, undefined);
    if (typeof target === 'number') {
      throw new Error(`Run resolution failed with exit code ${target}`);
    }

    expect(await resolveAttemptNumber(client, target)).toBe(3);
    expect(latestAttempt).toHaveBeenCalledExactlyOnceWith(
      client,
      INVOCATION_ID,
      'team_selected'
    );
  });

  it('propagates lookup failures instead of falling back to the list row', async () => {
    const error = new Error('Failed to fetch attempts');
    vi.spyOn(ciApi, 'getLatestCiAttempt').mockRejectedValue(error);
    const target = await resolveRunTarget(client, undefined, undefined);
    if (typeof target === 'number') {
      throw new Error(`Run resolution failed with exit code ${target}`);
    }

    await expect(resolveAttemptNumber(client, target)).rejects.toBe(error);
  });
});
