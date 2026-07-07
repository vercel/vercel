import { describe, expect, it, vi, beforeEach } from 'vitest';
import startRollingRelease from '../../../../src/commands/rolling-release/start-rolling-release';
import getProjectByDeployment from '../../../../src/util/projects/get-project-by-deployment';

vi.mock('../../../../src/util/projects/get-project-by-deployment');

const mockedGetProjectByDeployment = vi.mocked(getProjectByDeployment);

describe('rolling-release start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the dedicated rolling-release start endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue({});

    mockedGetProjectByDeployment.mockResolvedValue({
      contextName: 'my-team',
      deployment: {
        id: 'dpl_canary',
        target: 'production',
        ownerId: 'team_123',
      } as any,
      project: {
        id: 'prj_123',
      } as any,
    });

    const exitCode = await startRollingRelease({
      client: {
        fetch,
        nonInteractive: false,
        input: { confirm: vi.fn() },
      } as any,
      dpl: 'dpl_canary',
      projectId: 'prj_123',
      teamId: 'team_123',
      yes: false,
    });

    expect(exitCode).toBe(0);
    expect(fetch).toHaveBeenCalledWith(
      '/v1/projects/prj_123/rolling-release/start?teamId=team_123',
      {
        body: { canaryDeploymentId: 'dpl_canary' },
        json: true,
        method: 'POST',
      }
    );
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/promote/'),
      expect.anything()
    );
  });
});
