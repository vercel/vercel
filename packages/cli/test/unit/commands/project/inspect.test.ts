import assert from 'node:assert';
import { describe, it, expect } from 'vitest';
import { frameworkList } from '@vercel/frameworks';
import createLineIterator from 'line-async-iterator';
import projects from '../../../../src/commands/project';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { client } from '../../../mocks/client';

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

    let line = await lines.next();
    expect(line.value).toContain(`Found Project ${team.slug}/${project.name}`);

    // empty line
    line = await lines.next();
    expect(line.value).toEqual('');

    line = await lines.next();
    expect(line.value).toContain(`General`);

    // empty line
    line = await lines.next();
    expect(line.value).toEqual('');

    line = await lines.next();
    let parts = line.value!.trim().split(/\t+/);
    expect(parts).toEqual(['ID', project.id]);

    line = await lines.next();
    parts = line.value!.trim().split(/\t+/);
    expect(parts).toEqual(['Name', project.name]);

    line = await lines.next();
    parts = line.value!.trim().split(/\t+/);
    expect(parts).toEqual(['Owner', team.name]);

    line = await lines.next();
    parts = line.value!.trim().split(/\t+/);
    expect(parts[0]).toEqual('Created At');

    line = await lines.next();
    parts = line.value!.trim().split(/\t+/);
    expect(parts).toEqual(['Root Directory', project.rootDirectory]);

    line = await lines.next();
    parts = line.value!.trim().split(/\t+/);
    expect(parts).toEqual(['Node.js Version', project.nodeVersion]);

    // empty line
    line = await lines.next();
    expect(line.value).toEqual('');

    line = await lines.next();
    expect(line.value).toContain(`Framework Settings`);
    const fw = frameworkList.find(f => f.slug === project.framework);
    assert(fw);

    // empty line
    line = await lines.next();
    expect(line.value).toEqual('');

    line = await lines.next();
    parts = line.value!.trim().split(/\t+/);
    expect(parts).toEqual(['Framework Preset', fw.name]);

    line = await lines.next();
    parts = line.value!.trim().split(/\t+/);
    expect(parts).toEqual([
      'Build Command',
      fw.settings?.buildCommand.placeholder,
    ]);

    line = await lines.next();
    parts = line.value!.trim().split(/\t+/);
    expect(parts).toEqual([
      'Output Directory',
      fw.settings?.outputDirectory.placeholder,
    ]);

    line = await lines.next();
    parts = line.value!.trim().split(/\t+/);
    expect(parts).toEqual(['Install Command', project.installCommand]);

    // empty line
    line = await lines.next();
    expect(line.value).toEqual('');
  });
});
