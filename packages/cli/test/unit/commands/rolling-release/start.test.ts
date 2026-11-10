import { describe, expect, it, vi, beforeEach } from 'vitest';
import startRollingRelease from '../../../../src/commands/rolling-release/start-rolling-release';
import output from '../../../../src/output-manager';
import getProjectByDeployment from '../../../../src/util/projects/get-project-by-deployment';

vi.mock('../../../../src/util/projects/get-project-by-deployment');

const mockedGetProjectByDeployment = vi.mocked(getProjectByDeployment);

describe('rolling-release start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(output, 'log').mockImplementation(() => {});
  });

  it('reports the newly created production deployment without claiming release completion', async () => {
    const fetch = vi.fn().mockResolvedValue({
      id: 'dpl_new',
      inspectorUrl: 'https://vercel.com/team/project/dpl_new',
    });
    mockedGetProjectByDeployment.mockResolvedValue({
      contextName: 'my-team',
      deployment: {
        id: 'dpl_preview',
        target: 'preview',
        ownerId: 'team_123',
      } as any,
      project: { id: 'prj_123' } as any,
    });
    const exitCode = await startRollingRelease({
      client: { fetch, nonInteractive: true } as any,
      dpl: 'dpl_preview',
      projectId: 'prj_123',
      teamId: 'team_123',
      yes: true,
    });
    expect(exitCode).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(output.log).toHaveBeenCalledWith(
      'Created production deployment dpl_new: https://vercel.com/team/project/dpl_new'
    );
    expect(output.log).not.toHaveBeenCalledWith(
      expect.stringContaining('rolling release start')
    );
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
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(output.log).toHaveBeenCalledWith(
      'Requested rolling release start for dpl_canary'
    );
    expect(output.log).not.toHaveBeenCalledWith(
      'Successfully started rolling release'
    );
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
