import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { frameworkList } from '@vercel/frameworks';
import createLineIterator from 'line-async-iterator';
import projects from '../../../../src/commands/project';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { client } from '../../../mocks/client';
// import * as agentOutput from '../../../../src/util/agent-output';

/** stderr line chunks may omit blank lines; skip them for stable assertions. */
async function nextNonEmptyLine(
  lines: AsyncIterableIterator<string>
): Promise<string> {
  let line = await lines.next();
  while (line.value === '') {
    line = await lines.next();
  }
  if (line.done || line.value === undefined) {
    throw new Error('unexpected end of stderr lines');
  }
  return line.value;
}

describe('inspect', () => {
  describe('invalid argument', () => {
    it('errors', async () => {
      useUser();
      client.setArgv('project', 'inspect', 'name', 'extra');
      const exitCode = await projects(client);

      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'project';
      const subcommand = 'inspect';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = projects(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('should show project information', async () => {
    useUser();
    const teams = useTeams('team_dummy');
    assert(Array.isArray(teams));
    const [team] = teams;
    const { project } = useProject({
      ...defaultProject,
      name: 'test_project',
      accountId: team.id,
      rootDirectory: 'test',
      nodeVersion: '22.x',
      framework: 'nextjs',
      installCommand: 'pnpm i',
    });

    client.setArgv('project', 'inspect', project.name!);
    await projects(client);

    const lines = createLineIterator(client.stderr);

    let row = await nextNonEmptyLine(lines);
    expect(row).toContain(`Found Project ${team.slug}/${project.name}`);

    row = await nextNonEmptyLine(lines);
    expect(row).toContain(`General`);

    row = await nextNonEmptyLine(lines);
    let parts = row.trim().split(/\t+/);
    expect(parts).toEqual(['ID', project.id]);

    row = await nextNonEmptyLine(lines);
    parts = row.trim().split(/\t+/);
    expect(parts).toEqual(['Name', project.name]);

    row = await nextNonEmptyLine(lines);
    parts = row.trim().split(/\t+/);
    expect(parts).toEqual(['Owner', team.name]);

    row = await nextNonEmptyLine(lines);
    parts = row.trim().split(/\t+/);
    expect(parts[0]).toEqual('Created At');

    row = await nextNonEmptyLine(lines);
    parts = row.trim().split(/\t+/);
    expect(parts).toEqual(['Root Directory', project.rootDirectory]);

    row = await nextNonEmptyLine(lines);
    parts = row.trim().split(/\t+/);
    expect(parts).toEqual(['Node.js Version', project.nodeVersion]);

    row = await nextNonEmptyLine(lines);
    expect(row).toContain(`Framework Settings`);
    const fw = frameworkList.find(f => f.slug === project.framework);
    assert(fw);

    row = await nextNonEmptyLine(lines);
    parts = row.trim().split(/\t+/);
    expect(parts).toEqual(['Framework Preset', fw.name]);

    row = await nextNonEmptyLine(lines);
    parts = row.trim().split(/\t+/);
    expect(parts).toEqual([
      'Build Command',
      fw.settings?.buildCommand.placeholder,
    ]);

    row = await nextNonEmptyLine(lines);
    parts = row.trim().split(/\t+/);
    expect(parts).toEqual([
      'Output Directory',
      fw.settings?.outputDirectory.placeholder,
    ]);

    row = await nextNonEmptyLine(lines);
    parts = row.trim().split(/\t+/);
    expect(parts).toEqual(['Install Command', project.installCommand]);
  });

  describe('without linked project (cwd has no .vercel link)', () => {
    it('exits with error in non-interactive mode without starting link (--yes does not create)', async () => {
      useUser();
      // Fresh temp dir has no .vercel/project.json — getLinkedProject returns not_linked naturally
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-inspect-'));
      client.cwd = dir;
      client.nonInteractive = true;
      client.setArgv('project', 'inspect', '--yes');

      const exitCode = await projects(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('No Vercel project is linked');
    });

    // TODO
    // it('emits action_required JSON for agent mode', async () => {
    //   useUser();
    //   // Fresh temp dir has no .vercel/project.json — getLinkedProject returns not_linked naturally
    //   const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-inspect-agent-'));
    //   client.cwd = dir;
    //   // In real CLI, isAgent=true implies nonInteractive=true (Client constructor sets it).
    //   // Set both to match that invariant so the agent branch fires before the nonInteractive exit.
    //   client.isAgent = true;
    //   client.nonInteractive = true;
    //   client.setArgv('project', 'inspect');

    //   const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
    //     throw new Error('exit');
    //   });
    //   const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    //   try {
    //     await expect(projects(client)).rejects.toThrow('exit');
    //   } finally {
    //     exitSpy.mockRestore();
    //     logSpy.mockRestore();
    //   }

    //   expect(logSpy).toHaveBeenCalledTimes(1);
    //   const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    //   expect(agentOutput.isActionRequiredPayload(parsed)).toBe(true);
    //   expect(parsed.status).toBe('action_required');
    //   expect(parsed.message).toContain('No Vercel project is linked');
    //   expect(parsed.next?.map((n: { command: string }) => n.command)).toEqual(
    //     expect.arrayContaining([
    //       expect.stringMatching(/^vercel link/),
    //       expect.stringMatching(/^vercel project add <project-name>/),
    //       expect.stringMatching(/^vercel project inspect <project-name>/),
    //     ])
    //   );
    //   expect(
    //     parsed.next?.some((n: { command: string }) =>
    //       n.command.includes('--yes')
    //     )
    //   ).toBe(false);
    //   expect(exitSpy).toHaveBeenCalledWith(1);
    // });
  });
});
