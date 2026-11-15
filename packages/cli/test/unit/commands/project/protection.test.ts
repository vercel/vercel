import { afterEach, describe, expect, it, vi } from 'vitest';
import project from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';

describe('project protection (SSO)', () => {
  it('shows protection settings by default', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv('project', 'protection', 'my-project');
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Protection settings');
  });

  it('requires a protection option for action mode', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv('project', 'protection', 'enable', 'my-project');
    const exitCode = await project(client);

    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('No protection selected');
  });

  it('disables Vercel Authentication when --vercel-authentication is set', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      expect(req.body).toEqual({ ssoProtection: null });
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'protection',
      'disable',
      'my-project',
      '--vercel-authentication'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Deployment protection disabled');
  });

  it('returns JSON for enable with --vercel-authentication', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (_req, res) => {
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--vercel-authentication',
      '--format',
      'json'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(0);

    const out = JSON.parse(client.stdout.getFullOutput().trim());
    expect(out).toMatchObject({
      action: 'enable',
      projectId: 'prj_123',
      projectName: 'my-project',
      ssoProtection: true,
    });
  });

  describe('--non-interactive', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      client.nonInteractive = false;
    });

    it('outputs missing_arguments JSON when enable has no protection flag', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });

      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'protection',
        'enable',
        'my-project',
        '--non-interactive'
      );

      await expect(project(client)).rejects.toThrow('exit:2');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_arguments',
      });
      expect(payload.message).toMatch(/No protection selected/);
      expect(
        payload.next?.some((n: { command: string }) =>
          /project protection.*--vercel-authentication/.test(n.command)
        )
      ).toBe(true);
      expect(
        payload.next?.some((n: { command: string }) =>
          /project protection.*--password/.test(n.command)
        )
      ).toBe(true);
      expect(
        payload.next?.some((n: { command: string }) =>
          /project protection.*--customer-support-code-visibility/.test(
            n.command
          )
        )
      ).toBe(true);
      expect(
        payload.next?.some((n: { command: string }) =>
          /project protection.*--skew/.test(n.command)
        )
      ).toBe(true);
      expect(
        payload.next?.some((n: { command: string }) =>
          /project protection.*--protection-bypass/.test(n.command)
        )
      ).toBe(true);
      expect(
        payload.next?.some((n: { command: string }) =>
          /project protection.*--git-fork-protection/.test(n.command)
        )
      ).toBe(true);
    });

    it('outputs JSON when listing protection settings without --format', async () => {
      useProject({
        ...defaultProject,
        id: 'prj_123',
        name: 'my-project',
      });

      client.nonInteractive = true;
      client.setArgv(
        'project',
        'protection',
        'my-project',
        '--non-interactive'
      );
      const exitCode = await project(client);
      expect(exitCode).toBe(0);
      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload.projectId).toBe('prj_123');
      expect(payload.name).toBe('my-project');
    });
  });
});

describe('project protection (password)', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each([
    { tty: false, nonInteractive: false, json: false },
    { tty: false, nonInteractive: false, json: true },
    { tty: true, nonInteractive: true, json: false },
    { tty: false, nonInteractive: true, json: true },
  ])('blocks first-time activation with $tty TTY, $nonInteractive non-interactive, $json JSON', async ({
    tty,
    nonInteractive,
    json,
  }) => {
    useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
    client.stdin.isTTY = tty;
    client.nonInteractive = nonInteractive;
    const fetch = vi.spyOn(client, 'fetch');
    const confirm = vi.spyOn(client.input, 'text');
    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--password',
      '--protection-password',
      's3cret',
      ...(json ? ['--json'] : []),
      ...(nonInteractive ? ['--non-interactive'] : [])
    );

    expect(await project(client)).toBe(1);
    expect(
      fetch.mock.calls.filter(
        ([, opts]) => opts?.method && opts.method !== 'GET'
      )
    ).toEqual([]);
    expect(confirm).not.toHaveBeenCalled();
    if (json || nonInteractive) {
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        status: 'action_required',
        reason: 'interactive_confirmation_required',
        action: 'confirmation_required',
        userActionRequired: true,
        hint: expect.stringContaining('interactive confirmation'),
        next: [
          {
            command: expect.stringContaining(
              'vercel project protection enable prj_123 --password --protection-password <password>'
            ),
            when: expect.stringContaining('interactive terminal'),
          },
        ],
      });
      expect(client.stderr.getFullOutput()).toBe('');
    } else {
      expect(client.stdout.getFullOutput()).toBe('');
      expect(client.stderr.getFullOutput()).toContain(
        'Enabling Password Protection can incur charges.'
      );
    }
    expect(client.stdout.getFullOutput()).not.toContain('s3cret');
    expect(client.stderr.getFullOutput()).not.toContain('s3cret');
  });

  it('does not partially enable SSO when Password Protection is blocked', async () => {
    useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
    client.stdin.isTTY = false;
    const fetch = vi.spyOn(client, 'fetch');
    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--password',
      '--vercel-authentication'
    );
    expect(await project(client)).toBe(1);
    expect(
      fetch.mock.calls.filter(
        ([, opts]) => opts?.method && opts.method !== 'GET'
      )
    ).toEqual([]);
  });

  it.each([
    '',
    'wrong-project',
  ])('cancels activation when confirmation is %j', async entered => {
    useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
    const fetch = vi.spyOn(client, 'fetch');
    const confirm = vi.spyOn(client.input, 'text').mockResolvedValue(entered);
    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--password',
      '--vercel-authentication'
    );
    expect(await project(client)).toBe(0);
    expect(confirm).toHaveBeenCalledWith({
      message: 'Type my-project to confirm enabling Password Protection:',
    });
    expect(client.stderr.getFullOutput()).toContain('can incur charges');
    expect(client.stderr.getFullOutput()).toContain('Canceled');
    expect(
      fetch.mock.calls.filter(
        ([, opts]) => opts?.method && opts.method !== 'GET'
      )
    ).toEqual([]);
  });

  it('warns and confirms before activating Password Protection', async () => {
    useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
    const fetch = vi.spyOn(client, 'fetch');
    const confirm = vi
      .spyOn(client.input, 'text')
      .mockImplementation(async () => {
        expect(client.stderr.getFullOutput()).toContain('can incur charges');
        expect(
          fetch.mock.calls.filter(
            ([, opts]) => opts?.method && opts.method !== 'GET'
          )
        ).toEqual([]);
        return 'my-project';
      });
    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--password'
    );
    expect(await project(client)).toBe(0);
    expect(confirm).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      '/v9/projects/prj_123',
      expect.objectContaining({
        method: 'PATCH',
        body: {
          passwordProtection: {
            deploymentType: 'prod_deployment_urls_and_all_previews',
          },
        },
      })
    );
  });

  it.each([
    true,
    false,
  ])('updates an existing password without confirmation (TTY: %s)', async tty => {
    const existingProject = {
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
      passwordProtection: { deploymentType: 'all' },
    };
    useProject(existingProject);
    client.stdin.isTTY = tty;
    client.nonInteractive = !tty;
    const fetch = vi.spyOn(client, 'fetch');
    const confirm = vi.spyOn(client.input, 'text');
    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--password',
      '--protection-password',
      's3cret',
      '--json'
    );
    expect(await project(client)).toBe(0);
    expect(confirm).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      '/v9/projects/prj_123',
      expect.objectContaining({
        method: 'PATCH',
        body: {
          passwordProtection: {
            deploymentType: 'prod_deployment_urls_and_all_previews',
            password: 's3cret',
          },
        },
      })
    );
    expect(client.stderr.getFullOutput()).not.toContain('can incur charges');
    expect(client.stdout.getFullOutput()).not.toContain('s3cret');
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      passwordProtection: true,
    });
  });

  it('provides a safe interactive next step preserving scope', async () => {
    useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
    client.nonInteractive = true;
    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--password',
      '--protection-password',
      's3cret',
      '--scope',
      'my-team',
      '--token',
      'secret-token',
      '--non-interactive=true'
    );
    expect(await project(client)).toBe(1);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.next[0].command).toContain('--scope my-team');
    expect(payload.next[0].command).toContain('--non-interactive=false');
    expect(payload.next[0].command).not.toContain('--non-interactive=true');
    expect(JSON.stringify(payload)).not.toContain('secret-token');
    expect(JSON.stringify(payload)).not.toContain('s3cret');
  });

  it('can disable Password Protection in non-interactive mode', async () => {
    useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
    const fetch = vi.spyOn(client, 'fetch');
    client.nonInteractive = true;
    client.stdin.isTTY = false;
    client.setArgv(
      'project',
      'protection',
      'disable',
      'my-project',
      '--password',
      '--non-interactive'
    );
    expect(await project(client)).toBe(0);
    expect(fetch).toHaveBeenCalledWith(
      '/v9/projects/prj_123',
      expect.objectContaining({
        method: 'PATCH',
        body: { passwordProtection: null },
      })
    );
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      action: 'disable',
      passwordProtection: false,
    });
  });

  it('disables password protection when --password is set', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      expect(req.body).toEqual({ passwordProtection: null });
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'protection',
      'disable',
      'my-project',
      '--password'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Deployment protection disabled');
  });

  it('returns JSON for enable with --password', async () => {
    vi.spyOn(client.input, 'text').mockResolvedValue('my-project');
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (_req, res) => {
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--password',
      '--format',
      'json'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(0);

    const out = JSON.parse(client.stdout.getFullOutput().trim());
    expect(out).toMatchObject({
      action: 'enable',
      projectId: 'prj_123',
      projectName: 'my-project',
      passwordProtection: true,
    });
  });

  it('enables password protection with --protection-password', async () => {
    vi.spyOn(client.input, 'text').mockResolvedValue('my-project');
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      expect(req.body).toEqual({
        passwordProtection: {
          deploymentType: 'prod_deployment_urls_and_all_previews',
          password: 's3cret',
        },
      });
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--password',
      '--protection-password',
      's3cret'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Deployment protection enabled');
  });

  it('requires --password when --protection-password is set', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--protection-password',
      's3cret'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('requires `--password`');
  });

  it('rejects --protection-password with disable', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv(
      'project',
      'protection',
      'disable',
      'my-project',
      '--password',
      '--protection-password',
      's3cret'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('can only be used with');
  });

  it('rejects empty --protection-password', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--password',
      '--protection-password',
      '   '
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('Invalid --protection-password');
  });

  it('rejects --protection-password longer than 72 characters', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--password',
      '--protection-password',
      'a'.repeat(73)
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('Invalid --protection-password');
  });
});

describe('project protection (customer support code visibility)', () => {
  it('sets customerSupportCodeVisibility', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      expect(req.body).toEqual({ customerSupportCodeVisibility: true });
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--customer-support-code-visibility',
      '--format',
      'json'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(0);

    const out = JSON.parse(client.stdout.getFullOutput().trim());
    expect(out).toMatchObject({
      action: 'enable',
      projectId: 'prj_123',
      projectName: 'my-project',
      customerSupportCodeVisibility: true,
    });
  });
});

describe('project protection (skew)', () => {
  it('includes skewProtectionMaxAge when listing project protection as JSON', async () => {
    const projectWithSkew = {
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
      skewProtectionMaxAge: 2592000,
    };
    useProject(projectWithSkew as any);

    client.setArgv('project', 'protection', 'my-project', '--format', 'json');
    const exitCode = await project(client);
    expect(exitCode).toBe(0);
    const payload = JSON.parse(client.stdout.getFullOutput().trim());
    expect(payload.skewProtectionMaxAge).toBe(2592000);
  });

  it('enables skew protection via skewProtectionMaxAge', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      expect(req.body).toEqual({ skewProtectionMaxAge: 2592000 });
      res.json({ id: 'prj_123' });
    });

    client.setArgv('project', 'protection', 'enable', 'my-project', '--skew');
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
  });

  it('enables skew protection with custom --skew-max-age (seconds)', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      expect(req.body).toEqual({ skewProtectionMaxAge: 604800 });
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--skew',
      '--skew-max-age',
      '604800'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
  });

  it('rejects disable with --skew-max-age', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv(
      'project',
      'protection',
      'disable',
      'my-project',
      '--skew',
      '--skew-max-age',
      '604800'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('skew-max-age');
  });

  it('rejects invalid --skew-max-age', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--skew',
      '--skew-max-age',
      'not-a-number'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('Invalid --skew-max-age');
  });

  it('returns JSON for enable with --skew', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (_req, res) => {
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--skew',
      '--format',
      'json'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(0);

    const out = JSON.parse(client.stdout.getFullOutput().trim());
    expect(out).toMatchObject({
      action: 'enable',
      projectId: 'prj_123',
      projectName: 'my-project',
      skewProtection: true,
      skewProtectionMaxAge: 2592000,
    });
  });
});

describe('project protection (git fork)', () => {
  it('sets gitForkProtection', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      expect(req.body).toEqual({ gitForkProtection: false });
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'protection',
      'disable',
      'my-project',
      '--git-fork-protection'
    );
    const exitCode = await project(client);

    expect(exitCode).toBe(0);
  });

  it('returns JSON for enable with --git-fork-protection', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch('/v9/projects/prj_123', (_req, res) => {
      res.json({ id: 'prj_123' });
    });

    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--git-fork-protection',
      '--format',
      'json'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(0);

    const out = JSON.parse(client.stdout.getFullOutput().trim());
    expect(out).toMatchObject({
      action: 'enable',
      projectId: 'prj_123',
      projectName: 'my-project',
      gitForkProtection: true,
    });
  });
});

describe('project protection (automation bypass)', () => {
  it('enables protection bypass via project bypass endpoint', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.scenario.patch(
      '/v1/projects/prj_123/protection-bypass',
      (req, res) => {
        expect(req.body).toEqual({
          generate: {},
        });
        res.json({ protectionBypass: {} });
      }
    );

    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--protection-bypass',
      '--format',
      'json'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(0);

    const out = JSON.parse(client.stdout.getFullOutput().trim());
    expect(out).toMatchObject({
      action: 'enable',
      projectId: 'prj_123',
      projectName: 'my-project',
      protectionBypass: true,
    });
  });

  it('requires bypass secret when disabling protection bypass', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
    });

    client.setArgv(
      'project',
      'protection',
      'disable',
      'my-project',
      '--protection-bypass'
    );
    const exitCode = await project(client);
    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('requires --protection-bypass-secret');
  });
});

describe('project protection --deployment-type and status', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    client.nonInteractive = false;
  });

  it('keeps the legacy default for bare `enable --vercel-authentication`', async () => {
    useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
    const fetch = vi.spyOn(client, 'fetch');
    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--vercel-authentication'
    );
    expect(await project(client)).toBe(0);
    expect(fetch).toHaveBeenCalledWith(
      '/v9/projects/prj_123',
      expect.objectContaining({
        method: 'PATCH',
        body: {
          ssoProtection: {
            deploymentType: 'prod_deployment_urls_and_all_previews',
          },
        },
      })
    );
    expect(client.stderr.getFullOutput()).not.toContain('changed from');
  });

  it.each([
    ['preview', 'preview'],
    ['standard', 'all_except_custom_domains'],
    ['all', 'all'],
    ['legacy-standard', 'prod_deployment_urls_and_all_previews'],
    ['all_except_custom_domains', 'all_except_custom_domains'],
  ])('maps --deployment-type %s to %s for --sso', async (flag, apiValue) => {
    useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
    const fetch = vi.spyOn(client, 'fetch');
    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--vercel-authentication',
      '--deployment-type',
      flag,
      '--json'
    );
    expect(await project(client)).toBe(0);
    expect(fetch).toHaveBeenCalledWith(
      '/v9/projects/prj_123',
      expect.objectContaining({
        method: 'PATCH',
        body: { ssoProtection: { deploymentType: apiValue } },
      })
    );
    const out = JSON.parse(client.stdout.getFullOutput());
    expect(out).toMatchObject({ action: 'enable', ssoProtection: true });
    expect(out.previousSsoDeploymentType).toBeUndefined();
  });

  it('applies --deployment-type to --password', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
      passwordProtection: { deploymentType: 'all' },
    } as typeof defaultProject);
    const fetch = vi.spyOn(client, 'fetch');
    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--password',
      '--deployment-type',
      'preview'
    );
    expect(await project(client)).toBe(0);
    expect(fetch).toHaveBeenCalledWith(
      '/v9/projects/prj_123',
      expect.objectContaining({
        method: 'PATCH',
        body: { passwordProtection: { deploymentType: 'preview' } },
      })
    );
  });

  it('rejects an unknown --deployment-type before any request', async () => {
    useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
    const fetch = vi.spyOn(client, 'fetch');
    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--vercel-authentication',
      '--deployment-type',
      'production'
    );
    expect(await project(client)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Expected one of: standard, all, preview, legacy-standard'
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [['disable', 'my-project', '--vercel-authentication']],
    [['enable', 'my-project', '--skew']],
    [['my-project']],
  ])('rejects --deployment-type outside enable --vercel-authentication|--password (%j)', async args => {
    useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
    const fetch = vi.spyOn(client, 'fetch');
    client.setArgv(
      'project',
      'protection',
      ...args,
      '--deployment-type',
      'preview'
    );
    expect(await project(client)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      '`--deployment-type` can only be used with `project protection enable`'
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('warns when bare `enable --vercel-authentication` replaces a different existing setting', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
      ssoProtection: { deploymentType: 'all' },
    } as typeof defaultProject);
    client.scenario.patch('/v9/projects/prj_123', (req, res) => {
      expect(req.body).toEqual({
        ssoProtection: {
          deploymentType: 'prod_deployment_urls_and_all_previews',
        },
      });
      res.json({ id: 'prj_123' });
    });
    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--vercel-authentication'
    );
    expect(await project(client)).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(
      'Vercel Authentication changed from All Deployments to Standard Protection (legacy)'
    );
    expect(stderr).toContain('--deployment-type all');
    expect(stderr).toContain(
      'Deployment protection enabled for my-project (Standard Protection (legacy))'
    );
  });

  it('reports the previous setting in JSON without warnings on stderr', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
      ssoProtection: { deploymentType: 'all' },
    } as typeof defaultProject);
    client.scenario.patch('/v9/projects/prj_123', (_req, res) => {
      res.json({ id: 'prj_123' });
    });
    client.setArgv(
      'project',
      'protection',
      'enable',
      'my-project',
      '--vercel-authentication',
      '--json'
    );
    expect(await project(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      ssoProtection: true,
      ssoDeploymentType: 'legacy-standard',
      previousSsoDeploymentType: 'all',
    });
    expect(client.stderr.getFullOutput()).not.toContain('changed from');
  });

  it('`status` shows readable coverage', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
      ssoProtection: { deploymentType: 'preview' },
      passwordProtection: null,
    } as typeof defaultProject);
    client.setArgv('project', 'protection', 'status', 'my-project');
    expect(await project(client)).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Protection settings');
    expect(stderr).toContain(
      'Vercel Authentication: Pre-Production Deployments (legacy) (--deployment-type preview)'
    );
    expect(stderr).toContain('Password Protection: Off');
    expect(stderr).not.toContain('ssoProtection:');
  });

  it('`status --json` keeps raw fields and adds deploymentTypes', async () => {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
      ssoProtection: { deploymentType: 'all_except_custom_domains' },
    } as typeof defaultProject);
    client.setArgv('project', 'protection', 'status', 'my-project', '--json');
    expect(await project(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      projectId: 'prj_123',
      ssoProtection: { deploymentType: 'all_except_custom_domains' },
      deploymentTypes: {
        ssoProtection: 'standard',
        passwordProtection: 'off',
      },
    });
  });

  it('bare `protection` still shows status', async () => {
    useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
    client.setArgv('project', 'protection', 'my-project', '--json');
    expect(await project(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      projectId: 'prj_123',
      deploymentTypes: { ssoProtection: 'off' },
    });
  });

  it('rejects extra arguments to `status`', async () => {
    client.setArgv('project', 'protection', 'status', 'a', 'b');
    expect(await project(client)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Usage: `vercel project protection status [name]`'
    );
  });
});

describe('project protection status never prints bypass secrets', () => {
  const SECRET = 'bypass-secret-abcdefghijklmnopqrstuvwxyz';

  function useProjectWithBypass() {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
      protectionBypass: {
        [SECRET]: {
          createdAt: 1700000000000,
          createdBy: 'user_123',
          scope: 'automation-bypass',
        },
      },
    } as typeof defaultProject);
  }

  it('omits secrets from JSON and keeps non-secret metadata', async () => {
    useProjectWithBypass();
    client.setArgv('project', 'protection', 'status', 'my-project', '--json');
    expect(await project(client)).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).not.toContain(SECRET);
    const out = JSON.parse(stdout);
    expect(out).not.toHaveProperty('protectionBypass');
    expect(out.protectionBypassSecrets).toEqual([
      {
        scope: 'automation-bypass',
        createdAt: 1700000000000,
        createdBy: 'user_123',
      },
    ]);
  });

  it('summarizes bypass secrets in human output without the secret', async () => {
    useProjectWithBypass();
    client.setArgv('project', 'protection', 'status', 'my-project');
    expect(await project(client)).toBe(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Protection bypass: 1 secret (automation-bypass)');
    expect(stderr).not.toContain(SECRET);
    expect(client.stdout.getFullOutput()).not.toContain(SECRET);
  });
});

describe('project protection deprecated option names', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    client.nonInteractive = false;
  });

  it('accepts --sso as a deprecated alias and warns', async () => {
    useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
    const fetch = vi.spyOn(client, 'fetch');
    client.setArgv('project', 'protection', 'enable', 'my-project', '--sso');
    expect(await project(client)).toBe(0);
    expect(fetch).toHaveBeenCalledWith(
      '/v9/projects/prj_123',
      expect.objectContaining({
        method: 'PATCH',
        body: {
          ssoProtection: {
            deploymentType: 'prod_deployment_urls_and_all_previews',
          },
        },
      })
    );
    expect(client.stderr.getFullOutput()).toContain(
      '--sso is deprecated. Use --vercel-authentication.'
    );
  });

  it('reports the --sso deprecation warning in JSON', async () => {
    useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
    const fetch = vi.spyOn(client, 'fetch');
    client.setArgv(
      'project',
      'protection',
      'disable',
      'my-project',
      '--sso',
      '--json'
    );
    expect(await project(client)).toBe(0);
    expect(fetch).toHaveBeenCalledWith(
      '/v9/projects/prj_123',
      expect.objectContaining({
        method: 'PATCH',
        body: { ssoProtection: null },
      })
    );
    const out = JSON.parse(client.stdout.getFullOutput());
    expect(out).toMatchObject({ action: 'disable', ssoProtection: false });
    expect(out.warnings).toEqual([
      {
        reason: 'deprecated',
        message: '--sso is deprecated. Use --vercel-authentication.',
      },
    ]);
    expect(client.stderr.getFullOutput()).not.toContain('deprecated');
  });

  it('does not add warnings to JSON when only new names are used', async () => {
    useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
    vi.spyOn(client, 'fetch');
    client.setArgv(
      'project',
      'protection',
      'disable',
      'my-project',
      '--vercel-authentication',
      '--json'
    );
    expect(await project(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).not.toHaveProperty(
      'warnings'
    );
  });

  it.each([
    ['--sso', '--vercel-authentication'],
  ])('rejects %s together with %s', async (oldName, newName) => {
    useProject({ ...defaultProject, id: 'prj_123', name: 'my-project' });
    const fetch = vi.spyOn(client, 'fetch');
    client.setArgv(
      'project',
      'protection',
      'disable',
      'my-project',
      oldName,
      newName
    );
    expect(await project(client)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      `Can't use ${newName} with ${oldName}.`
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('bare project protection keeps its existing bypass output', () => {
  const SECRET = 'bypass-secret-abcdefghijklmnopqrstuvwxyz';

  function useProjectWithBypass() {
    useProject({
      ...defaultProject,
      id: 'prj_123',
      name: 'my-project',
      protectionBypass: {
        [SECRET]: {
          createdAt: 1700000000000,
          createdBy: 'user_123',
          scope: 'automation-bypass',
        },
      },
    } as typeof defaultProject);
  }

  it('still includes protectionBypass in JSON', async () => {
    useProjectWithBypass();
    client.setArgv('project', 'protection', 'my-project', '--json');
    expect(await project(client)).toBe(0);
    const out = JSON.parse(client.stdout.getFullOutput());
    expect(Object.keys(out.protectionBypass)).toEqual([SECRET]);
    expect(out).not.toHaveProperty('protectionBypassSecrets');
  });

  it('still prints protectionBypass in human output', async () => {
    useProjectWithBypass();
    client.setArgv('project', 'protection', 'my-project');
    expect(await project(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('protectionBypass:');
  });
});
