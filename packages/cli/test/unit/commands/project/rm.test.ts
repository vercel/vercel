import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import stripAnsi from 'strip-ansi';
import { useUser } from '../../../mocks/user';
import projects from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { createTeam, useTeam } from '../../../mocks/team';
import { TEAM_NOT_CHOSEN } from '../../../../src/util/client';

describe('rm', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'project';
      const subcommand = 'rm';

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

  describe('[name]', () => {
    let deletes: Array<string | undefined>;
    let deleteStatus: number;

    beforeEach(() => {
      useUser();
      deletes = [];
      deleteStatus = 200;
      // Registered before `useProject` so it records the team of each delete.
      client.scenario.delete('/v2/projects/:name', (req, res) => {
        deletes.push(req.query.teamId as string | undefined);
        if (deleteStatus !== 200) {
          res
            .status(deleteStatus)
            .json({ error: { code: 'internal', message: 'boom' } });
          return;
        }
        res.json({});
      });
      useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });
    });

    afterEach(() => {
      delete process.env.VERCEL_ORG_ID;
      vi.restoreAllMocks();
    });

    it('deletes a project after typing its name', async () => {
      const team = useTeam();
      client.config.currentTeam = team.id;
      client.setArgv('project', 'delete', 'test-project');
      const projectsPromise = projects(client);

      await expect(client.stderr).toOutput(
        `To confirm, type the project name "test-project":`
      );
      const preview = stripAnsi(client.stderr.getFullOutput());
      expect(preview).toContain(`  Project         ${team.slug}/test-project`);
      expect(preview).toContain(
        '  Deletes the project and all of its deployments.\n  This cannot be undone.'
      );
      client.stdin.write('test-project\n');

      expect(await projectsPromise).toEqual(0);
      expect(deletes).toEqual([team.id]);
      expect(stripAnsi(client.stderr.getFullOutput())).toContain(
        '✓ Deleted         test-project'
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:delete', value: 'delete' },
        { key: 'argument:name', value: '[REDACTED]' },
      ]);
    });

    it('deletes nothing when the typed name does not match', async () => {
      client.setArgv('project', 'delete', 'test-project');
      const projectsPromise = projects(client);

      await expect(client.stderr).toOutput(
        'To confirm, type the project name "test-project":'
      );
      client.stdin.write('test\n');

      expect(await projectsPromise).toEqual(130);
      await expect(client.stderr).toOutput('Canceled. Nothing was changed.');
      expect(deletes).toEqual([]);
    });

    it('still asks for the name with --yes when the team is not explicit', async () => {
      const team = useTeam();
      createTeam();
      client.config.currentTeam = team.id;
      client.setArgv('project', 'delete', 'test-project', '--yes');
      const projectsPromise = projects(client);

      await expect(client.stderr).toOutput(
        'To confirm, type the project name "test-project":'
      );
      client.stdin.write('test-project\n');

      expect(await projectsPromise).toEqual(0);
      expect(deletes).toEqual([team.id]);
    });

    it.each([
      ['rm', false],
      ['del', false],
      ['remove', true],
    ])('runs as %s (deprecated: %s)', async (name, deprecated) => {
      client.setArgv('project', name, 'test-project');
      const projectsPromise = projects(client);

      await expect(client.stderr).toOutput(
        'To confirm, type the project name "test-project":'
      );
      client.stdin.write('test-project\n');

      expect(await projectsPromise).toEqual(0);
      const warning =
        '`vercel project remove` is deprecated. Use `vercel project delete`.';
      if (deprecated) {
        expect(client.stderr.getFullOutput()).toContain(warning);
      } else {
        expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
      }
    });

    it('refuses without --yes when non-interactive on a terminal', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);
      const team = useTeam();
      createTeam();
      client.config.currentTeam = team.id;
      client.nonInteractive = true;
      client.setArgv('project', 'delete', 'test-project', '--non-interactive');

      await expect(projects(client)).rejects.toThrow('exit:2');
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'confirmation_required',
        userActionRequired: true,
      });
      // Several teams and none named, so `--yes` alone would fail next.
      expect(payload.next[0].command).toBe(
        'vercel project delete test-project --non-interactive --yes --scope <TEAM>'
      );
      expect(client.stderr.getFullOutput()).not.toContain('Are you sure?');
      expect(deletes).toEqual([]);
    });

    it('suggests only --yes when the team is already explicit', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);
      const team = useTeam();
      client.config.currentTeam = team.id;
      client.nonInteractive = true;
      client.setArgv('project', 'delete', 'test-project', '--non-interactive');

      await expect(projects(client)).rejects.toThrow('exit:2');
      expect(JSON.parse(client.stdout.getFullOutput()).next[0].command).toBe(
        'vercel project delete test-project --non-interactive --yes'
      );
      expect(deletes).toEqual([]);
    });

    it('reports a failed delete instead of a receipt', async () => {
      deleteStatus = 500;
      client.setArgv('project', 'delete', 'test-project');
      const projectsPromise = projects(client);

      await expect(client.stderr).toOutput(
        'To confirm, type the project name "test-project":'
      );
      client.stdin.write('test-project\n');

      expect(await projectsPromise).toEqual(1);
      expect(deletes).toHaveLength(1);
      expect(client.stderr.getFullOutput()).not.toContain('Deleted');
    });

    describe('without a terminal', () => {
      beforeEach(() => {
        client.stdin.isTTY = false;
      });

      it('refuses --non-interactive without --yes instead of prompting', async () => {
        vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
          throw new Error(`exit:${code ?? 0}`);
        }) as () => never);
        client.nonInteractive = true;
        client.setArgv(
          'project',
          'delete',
          'test-project',
          '--non-interactive'
        );

        await expect(projects(client)).rejects.toThrow('exit:2');
        expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
          status: 'action_required',
          reason: 'confirmation_required',
        });
        expect(client.stderr.getFullOutput()).not.toContain('Are you sure?');
        expect(deletes).toEqual([]);
      });

      it('refuses an agent without --yes instead of prompting', async () => {
        vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
          throw new Error(`exit:${code ?? 0}`);
        }) as () => never);
        client.isAgent = true;
        client.nonInteractive = true;
        client.setArgv('project', 'delete', 'test-project');

        await expect(projects(client)).rejects.toThrow('exit:2');
        expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
          status: 'action_required',
          reason: 'confirmation_required',
          userActionRequired: true,
        });
        expect(client.stderr.getFullOutput()).not.toContain('Are you sure?');
        expect(deletes).toEqual([]);
      });

      it('keeps the piped confirmation working, with a warning', async () => {
        client.setArgv('project', 'delete', 'test-project');
        const projectsPromise = projects(client);

        await expect(client.stderr).toOutput(
          'Deleting a project without a terminal will need --yes and --scope in a future major version.'
        );
        client.stdin.write('y\n');

        expect(await projectsPromise).toEqual(0);
        expect(deletes).toHaveLength(1);
      });

      it('deletes with --yes and --scope', async () => {
        const team = useTeam();
        createTeam();
        client.config.currentTeam = team.id;
        client.setArgv(
          'project',
          'delete',
          'test-project',
          '--yes',
          '--scope',
          team.slug
        );

        expect(await projects(client)).toEqual(0);
        expect(deletes).toEqual([team.id]);
        expect(client.stderr.getFullOutput()).not.toContain('To confirm');
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          { key: 'subcommand:delete', value: 'delete' },
          { key: 'argument:name', value: '[REDACTED]' },
          { key: 'flag:yes', value: 'TRUE' },
        ]);
      });

      it.each([
        ['--scope', ''],
        ['--scope='],
      ])('refuses --yes with an empty %s', async (...scopeArgs) => {
        const team = useTeam();
        createTeam();
        client.config.currentTeam = team.id;
        client.setArgv(
          'project',
          'delete',
          'test-project',
          '--yes',
          ...scopeArgs
        );

        expect(await projects(client)).toEqual(2);
        expect(deletes).toEqual([]);
      });

      it('deletes with --yes when VERCEL_ORG_ID names the team', async () => {
        const team = useTeam();
        createTeam();
        client.config.currentTeam = team.id;
        process.env.VERCEL_ORG_ID = team.id;
        client.setArgv('project', 'delete', 'test-project', '--yes');

        expect(await projects(client)).toEqual(0);
        expect(deletes).toEqual([team.id]);
      });

      it('deletes with --yes when the user has only one team', async () => {
        const team = useTeam();
        client.config.currentTeam = team.id;
        client.setArgv('project', 'delete', 'test-project', '--yes');

        expect(await projects(client)).toEqual(0);
        expect(deletes).toEqual([team.id]);
      });

      it('refuses --yes without a team when the user has several', async () => {
        const team = useTeam();
        createTeam();
        client.config.currentTeam = team.id;
        client.setArgv('project', 'delete', 'test-project', '--yes');

        expect(await projects(client)).toEqual(2);
        await expect(client.stderr).toOutput(
          "Can't delete project test-project without a team in non-interactive mode."
        );
        expect(client.stderr.getFullOutput()).toContain(
          'vercel project delete test-project --yes --scope <TEAM>'
        );
        expect(deletes).toEqual([]);
      });

      it('refuses --yes when VERCEL_ORG_ID names a different team than the delete', async () => {
        const team = useTeam();
        const other = createTeam();
        client.config.currentTeam = team.id;
        process.env.VERCEL_ORG_ID = other.id;
        client.setArgv('project', 'delete', 'test-project', '--yes');

        expect(await projects(client)).toEqual(2);
        expect(deletes).toEqual([]);
      });

      it('deletes in the VERCEL_ORG_ID team for an agent', async () => {
        const team = useTeam('team_agent');
        createTeam();
        client.isAgent = true;
        client.nonInteractive = true;
        client.ignoresSavedTeam = true;
        client.config.currentTeam = TEAM_NOT_CHOSEN;
        process.env.VERCEL_ORG_ID = team.id;
        client.setArgv('project', 'delete', 'test-project', '--yes');

        expect(await projects(client)).toEqual(0);
        expect(deletes).toEqual([team.id]);
      });
    });
  });
});
