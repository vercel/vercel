import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';
import { KNOWN_AGENTS } from '@vercel/detect-agent';
import env from '../../../src/commands/env';
import project from '../../../src/commands/project';
import pull from '../../../src/commands/pull';
import { setupUnitFixture } from '../../helpers/setup-unit-fixture';
import { client } from '../../mocks/client';
import { defaultProject, useProject } from '../../mocks/project';
import { useTeams } from '../../mocks/team';
import { useUser } from '../../mocks/user';

// Records every child process; each one still runs.
vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

// `env`, `project` and `pull` used to check the Vercel plugin for Claude Code
// after every successful run: `claude plugins list --json`, plus a request for
// the plugin's latest version. Now a first-time user gets one offer after
// their first interactive run (`plugin-offer.ts`), and `vercel setup plugin`
// installs it on request.
describe('Claude plugin check', () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(async () => {
    // A saved answer to the old prompt skipped the check; start without one.
    await rm(join(client.getGlobalPathConfig(), 'agent-preferences.json'), {
      force: true,
    });
    vi.mocked(spawn).mockClear();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    // An agent run inside Claude Code, when the check used to run.
    client.agentName = KNOWN_AGENTS.CLAUDE;
    client.nonInteractive = true;
    useUser();
    useTeams('team_dummy');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function expectNoPluginCheck() {
    const commands = vi.mocked(spawn).mock.calls.map(([command]) => command);
    expect(commands).not.toContain('claude');
    const urls = fetchSpy.mock.calls.map(([url]) => String(url));
    expect(urls.filter(url => url.includes('vercel-plugin'))).toEqual([]);
  }

  it('does not run after a successful `vercel env ls`', async () => {
    useProject({ ...defaultProject, id: 'vercel-env-ls', name: 'env-ls' });
    client.cwd = setupUnitFixture('commands/env/vercel-env-ls');
    client.setArgv('env', 'ls');

    await expect(env(client)).resolves.toBe(0);
    expectNoPluginCheck();
  });

  it('does not run after a successful `vercel project ls`', async () => {
    useProject({ ...defaultProject });
    client.setArgv('project', 'ls');

    await expect(project(client)).resolves.toBe(0);
    expectNoPluginCheck();
  });

  it('does not run after a successful `vercel pull`', async () => {
    const cwd = setupUnitFixture('vercel-pull-next');
    useProject({
      ...defaultProject,
      id: 'vercel-pull-next',
      name: 'vercel-pull-next',
    });
    client.setArgv('pull', cwd);

    await expect(pull(client)).resolves.toBe(0);
    expectNoPluginCheck();
  });
});
