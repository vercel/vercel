import { beforeEach, describe, expect, it, vi } from 'vitest';
import output from '../../../../src/output-manager';
import getProjectByDeployment from '../../../../src/util/projects/get-project-by-deployment';
import approveRollingRelease from '../../../../src/commands/rolling-release/approve-rolling-release';
import completeRollingRelease from '../../../../src/commands/rolling-release/complete-rolling-release';
import abortRollingRelease from '../../../../src/commands/rolling-release/abort-rolling-release';

vi.mock('../../../../src/util/projects/get-project-by-deployment');

describe('rolling release request results', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(output, 'log').mockImplementation(() => {});
    vi.mocked(getProjectByDeployment).mockResolvedValue({
      contextName: 'my-team',
      deployment: {
        id: 'dpl_resolved',
        target: 'production',
        ownerId: 'team_123',
      } as any,
      project: { id: 'prj_123' } as any,
    });
  });

  it.each([
    {
      run: approveRollingRelease,
      endpoint:
        '/v1/projects/prj_123/rolling-release/approve-stage?teamId=team_123',
      body: {
        activeStageIndex: 1,
        nextStageIndex: 2,
        canaryDeploymentId: 'dpl_resolved',
      },
      message:
        'Requested rolling release approval from stage 1 to 2 for dpl_resolved',
    },
    {
      run: completeRollingRelease,
      endpoint: '/v1/projects/prj_123/rolling-release/complete?teamId=team_123',
      body: { canaryDeploymentId: 'dpl_resolved' },
      message: 'Requested rolling release completion for dpl_resolved',
    },
    {
      run: abortRollingRelease,
      endpoint: '/v9/projects/prj_123/rollback/dpl_resolved?teamId=team_123',
      body: {},
      message: 'Requested rolling release abort and rollback to dpl_resolved',
    },
  ])('$message', async ({ run, endpoint, body, message }) => {
    const fetch = vi.fn().mockResolvedValue({});
    const stdout = { write: vi.fn() };
    const args = {
      client: { fetch, stdout } as any,
      projectId: 'prj_123',
      teamId: 'team_123',
      dpl: 'preview.example.com',
      activeStageIndex: 1,
    };
    expect(await run(args)).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({ method: 'POST', body })
    );
    expect(output.log).toHaveBeenCalledWith(message);
    expect(output.log).not.toHaveBeenCalledWith(
      expect.stringContaining('Successfully')
    );
    expect(stdout.write).not.toHaveBeenCalled();
  });

  it('does not report an accepted request when the API fails', async () => {
    const error = new Error('Request failed');
    const fetch = vi.fn().mockRejectedValue(error);
    await expect(
      completeRollingRelease({
        client: { fetch } as any,
        projectId: 'prj_123',
        teamId: 'team_123',
        dpl: 'dpl_resolved',
      })
    ).rejects.toBe(error);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(output.log).not.toHaveBeenCalled();
  });
});
