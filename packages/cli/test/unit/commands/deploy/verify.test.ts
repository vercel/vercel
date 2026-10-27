import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import { join } from 'path';
import deploy from '../../../../src/commands/deploy';
import output from '../../../../src/output-manager';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import { defaultProject, useProject } from '../../../mocks/project';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';

vi.mock(
  '../../../../src/util/deploy/verify-deployment',
  async importOriginal => ({
    ...(await importOriginal<
      typeof import('../../../../src/util/deploy/verify-deployment')
    >()),
    verifyDeployment: vi.fn(),
  })
);

import {
  type DeploymentVerification,
  verifyDeployment,
} from '../../../../src/util/deploy/verify-deployment';

const verified: DeploymentVerification = {
  url: 'https://report.vercel.app',
  ok: true,
  statusCode: 200,
  size: 46,
  title: 'Q3 report',
  error: null,
};

async function setupLinkedReport() {
  const cwd = setupTmpDir();
  const path = join(cwd, 'report.html');
  await fs.writeFile(path, '<title>Q3 report</title>');
  await fs.outputJson(join(cwd, '.vercel/project.json'), {
    projectId: 'static',
    orgId: 'team_dummy',
    projectName: 'static',
  });
  useUser();
  useTeams('team_dummy');
  useProject({
    ...defaultProject,
    name: 'static',
    id: 'static',
    accountId: 'team_dummy',
  });
  client.cwd = cwd;
  return path;
}

function useDeployment(fields: Record<string, unknown> = {}) {
  const created: unknown[] = [];
  client.scenario.post('/v13/deployments', (req, res) => {
    created.push(req.body);
    res.json({
      id: 'dpl_report',
      readyState: 'READY',
      aliasAssigned: true,
      url: 'report-abc.vercel.app',
      alias: [],
      ...fields,
    });
  });
  return created;
}

beforeEach(() => {
  vi.mocked(verifyDeployment).mockReset();
  vi.mocked(verifyDeployment).mockResolvedValue(verified);
});

afterEach(() => {
  (client as { nonInteractive: boolean }).nonInteractive = false;
  output.initialize({ hideSpinners: false });
  vi.restoreAllMocks();
});

describe('deploy --verify', () => {
  it('loads the deployment URL and adds the result to the JSON', async () => {
    const path = await setupLinkedReport();
    useDeployment();
    (client as { nonInteractive: boolean }).nonInteractive = true;
    client.setArgv('deploy', path, '--verify');

    expect(await deploy(client)).toBe(0);

    expect(verifyDeployment).toHaveBeenCalledWith(
      client,
      'https://report-abc.vercel.app',
      {
        project: expect.objectContaining({ id: 'static' }),
        org: expect.objectContaining({ id: 'team_dummy' }),
        protectionEnabled: false,
      }
    );
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.status).toBe('ok');
    expect(payload.deployment.verification).toEqual(verified);
    expect(JSON.stringify(payload.next)).not.toContain(' curl ');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:verify', value: 'TRUE' },
      { key: 'argument:project-path', value: '[REDACTED]' },
      { key: 'target_environment', value: 'preview' },
      { key: 'output:deployment-id', value: 'dpl_report' },
    ]);
  });

  it('loads the production alias for a production deployment', async () => {
    const path = await setupLinkedReport();
    useDeployment({ target: 'production', alias: ['report.vercel.app'] });
    (client as { nonInteractive: boolean }).nonInteractive = true;
    client.setArgv('deploy', path, '--prod', '--verify');

    expect(await deploy(client)).toBe(0);

    expect(vi.mocked(verifyDeployment).mock.calls[0][1]).toBe(
      'https://report.vercel.app'
    );
  });

  it('exits 1 with verification_failed when the URL does not load', async () => {
    const path = await setupLinkedReport();
    useDeployment();
    const failed = { ...verified, ok: false, statusCode: 500, title: null };
    vi.mocked(verifyDeployment).mockResolvedValue(failed);
    (client as { nonInteractive: boolean }).nonInteractive = true;
    client.setArgv('deploy', path, '--verify');

    expect(await deploy(client)).toBe(1);

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'verification_failed',
      message: 'https://report.vercel.app returned 500.',
      deployment: { id: 'dpl_report', verification: failed },
    });
    expect(payload.next[0].command).toBe(
      'vercel curl https://report.vercel.app'
    );
  });

  it('prints the verified URL after Ready in human output', async () => {
    const path = await setupLinkedReport();
    useDeployment();
    client.setArgv('deploy', path, '--verify');

    expect(await deploy(client)).toBe(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(
      '✓ Verified https://report.vercel.app (200, 46 B, "Q3 report")'
    );
    expect(stderr.indexOf('Verified')).toBeGreaterThan(stderr.indexOf('Ready'));
  });

  it.each([
    '--no-wait',
    '--dry',
  ])('rejects %s because there is no ready deployment to load', async flag => {
    const path = await setupLinkedReport();
    const created = useDeployment();
    client.setArgv('deploy', path, '--verify', flag);

    expect(await deploy(client)).toBe(2);

    expect(created).toHaveLength(0);
    expect(verifyDeployment).not.toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toContain(
      `Can't use --verify with ${flag}.`
    );
  });

  it('reports the conflict as JSON for agents', async () => {
    const path = await setupLinkedReport();
    useDeployment();
    (client as { nonInteractive: boolean }).nonInteractive = true;
    client.setArgv('deploy', path, '--verify', '--no-wait');

    expect(await deploy(client)).toBe(2);

    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
    });
  });

  it('leaves the next steps alone without --verify', async () => {
    const path = await setupLinkedReport();
    useDeployment();
    (client as { nonInteractive: boolean }).nonInteractive = true;
    client.setArgv('deploy', path);

    expect(await deploy(client)).toBe(0);

    expect(verifyDeployment).not.toHaveBeenCalled();
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.deployment.verification).toBeUndefined();
    expect(JSON.stringify(payload.next)).toContain(
      'vercel curl https://report-abc.vercel.app'
    );
  });
});

describe('deploy output for agents', () => {
  function captureProcessStderr() {
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation(chunk => {
      writes.push(String(chunk));
      return true;
    });
    return writes;
  }

  it('erases and reprints the URL row when spinners can show', async () => {
    const path = await setupLinkedReport();
    useDeployment();
    const writes = captureProcessStderr();
    client.setArgv('deploy', path);

    expect(await deploy(client)).toBe(0);

    expect(writes.join('')).toContain('\u001b[2K');
  });

  it('writes no erase codes or spinner lines when spinners are hidden', async () => {
    const path = await setupLinkedReport();
    useDeployment();
    const writes = captureProcessStderr();
    output.initialize({ hideSpinners: true });
    client.setArgv('deploy', path);

    expect(await deploy(client)).toBe(0);

    expect(writes.join('')).not.toContain('\u001b[');
    const stderr = client.stderr.getFullOutput();
    expect(stderr).not.toContain('Completing');
    expect(stderr.match(/Preview/g)).toHaveLength(1);
  });
});
