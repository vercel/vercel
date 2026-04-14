import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import alerts from '../../../../src/commands/alerts';
import * as linkModule from '../../../../src/util/projects/link';
import * as getScopeModule from '../../../../src/util/get-scope';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedGetScope = vi.mocked(getScopeModule.default);

let tmpDir: string;

function mockLinkedProject() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: 'prj_alerts',
      name: 'alerts-project',
      accountId: 'team_dummy',
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: {
      id: 'team_dummy',
      slug: 'my-team',
      type: 'team',
    },
  });
}

function mockTeamScope() {
  mockedGetScope.mockResolvedValue({
    contextName: 'my-team',
    team: { id: 'team_dummy', slug: 'my-team' } as any,
    user: { id: 'user_dummy' } as any,
  });
}

describe('alerts rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    tmpDir = setupTmpDir('vercel-alerts-rules');
    client.cwd = tmpDir;
  });

  it('lists alert rules for linked project', async () => {
    let path = '';
    client.scenario.get('/alerts/v2/alert-rules', (req, res) => {
      path = req.path;
      expect(req.query.teamId).toBe('team_dummy');
      expect(req.query.projectId).toBe('prj_alerts');
      res.json([
        {
          id: 'ar_1',
          name: 'My rule',
          teamId: 'team_dummy',
          projectId: 'prj_alerts',
        },
      ]);
    });

    client.setArgv('alerts', 'rules', 'ls');

    const exitCode = await alerts(client);
    expect(exitCode).toBe(0);
    expect(path).toContain('/alerts/v2/alert-rules');
    expect(client.stderr.getFullOutput()).toContain('ar_1');
    expect(client.stderr.getFullOutput()).toContain('My rule');
  });

  it('creates a rule with POST', async () => {
    let method = '';
    client.scenario.post('/alerts/v2/alert-rules', (req, res) => {
      method = req.method;
      expect(req.query.teamId).toBe('team_dummy');
      expect(req.query.projectId).toBe('prj_alerts');
      expect(req.body).toMatchObject({
        name: 'from-cli',
        projectId: 'prj_alerts',
      });
      res.status(201).json({
        id: 'ar_new',
        name: 'from-cli',
        teamId: 'team_dummy',
        projectId: 'prj_alerts',
      });
    });

    writeFileSync(
      join(tmpDir, 'rule.json'),
      JSON.stringify({ name: 'from-cli' })
    );
    client.setArgv('alerts', 'rules', 'add', '--body', 'rule.json');

    const exitCode = await alerts(client);
    expect(exitCode).toBe(0);
    expect(method).toBe('POST');
    expect(client.stderr.getFullOutput()).toContain('Created alert rule');
  });

  it('deletes a rule with --yes', async () => {
    let method = '';
    client.scenario.delete('/alerts/v2/alert-rules/:ruleId', (req, res) => {
      method = req.method;
      expect(req.params.ruleId).toBe('ar_x');
      expect(req.query.teamId).toBe('team_dummy');
      res.json({ success: true });
    });

    client.setArgv('alerts', 'rules', 'rm', 'ar_x', '--yes');

    const exitCode = await alerts(client);
    expect(exitCode).toBe(0);
    expect(method).toBe('DELETE');
    expect(client.stderr.getFullOutput()).toContain('Deleted');
  });

  it('patches a rule', async () => {
    let method = '';
    client.scenario.patch('/alerts/v2/alert-rules/:ruleId', (req, res) => {
      method = req.method;
      expect(req.params.ruleId).toBe('ar_x');
      res.json({ id: 'ar_x', name: 'patched' });
    });

    writeFileSync(
      join(tmpDir, 'patch.json'),
      JSON.stringify({ name: 'patched' })
    );
    client.setArgv('alerts', 'rules', 'update', 'ar_x', '--body', 'patch.json');

    const exitCode = await alerts(client);
    expect(exitCode).toBe(0);
    expect(method).toBe('PATCH');
  });

  describe('--non-interactive', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      client.nonInteractive = false;
    });

    it('rm without --yes emits confirmation_required JSON', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv(
        'alerts',
        'rules',
        'rm',
        'ar_x',
        '--non-interactive',
        '--cwd=/tmp/a'
      );

      await expect(alerts(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'confirmation_required',
      });
      expect(
        payload.next?.some((n: { command?: string }) =>
          String(n.command).includes('--yes')
        )
      ).toBe(true);
    });
  });
});
