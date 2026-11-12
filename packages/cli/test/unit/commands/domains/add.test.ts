import { describe, it, expect, vi } from 'vitest';
import { join } from 'path';
import { outputFile } from 'fs-extra';
import domains from '../../../../src/commands/domains';
import * as addDomainModule from '../../../../src/util/projects/add-domain-to-project';
import { client } from '../../../mocks/client';
import { useDomain } from '../../../mocks/domains';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeam } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';

describe('domains add', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'domains';
      const subcommand = 'add';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = domains(client);
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
    it('adds a domain to the team without a project', async () => {
      useUser();
      const domain = useDomain();
      client.setArgv('domains', 'add', domain.name);
      client.scenario.post('/v7/domains', (req, res) => {
        // v7 defaults `zone` to false, so the CLI must opt in explicitly to
        // keep creating DNS zones.
        expect(req.body).toEqual({ name: domain.name, zone: true });
        res.json({ domain });
      });
      const exitCode = await domains(client);
      expect(exitCode, 'exit code for "domains"').toEqual(0);

      await expect(client.stderr).toOutput(`Domain ${domain.name} added to`);
      // When no project is provided, we must not print project/deployment
      // oriented configuration guidance.
      const fullOutput = client.stderr.getFullOutput();
      expect(fullOutput).not.toContain(
        'This domain is not configured properly'
      );
      expect(fullOutput).not.toContain(
        'automatically get assigned to your latest production deployment'
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:add',
          value: 'add',
        },
        {
          key: 'argument:domain',
          value: '[REDACTED]',
        },
      ]);
    });

    it('errors with a specific message for a subdomain without a project', async () => {
      useUser();
      client.setArgv('domains', 'add', 'sub.example.com');
      const exitCode = await domains(client);
      expect(exitCode, 'exit code for "domains"').toEqual(1);

      await expect(client.stderr).toOutput(
        'Only apex domains can be added without a project. To add the subdomain sub.example.com, pass a project: vercel domains add sub.example.com <project>'
      );
    });

    describe('[project]', () => {
      it('points to `domains verify` when the domain is misconfigured', async () => {
        useUser();
        const domain = useDomain();
        const { project } = useProject();
        client.setArgv('domains', 'add', domain.name, String(project.name));
        client.scenario.post(`/projects/${project.name}/alias`, (_req, res) => {
          res.json([{ domain: domain.name }]);
        });
        client.scenario.get(
          `/:version/domains/${domain.name}/config`,
          (_req, res) => {
            res.json({ misconfigured: true });
          }
        );
        const exitCode = await domains(client);
        expect(exitCode, 'exit code for "domains"').toEqual(0);

        await expect(client.stderr).toOutput(
          `This domain is not configured properly. Run \`vercel domains verify ${domain.name}\``
        );
        const fullOutput = client.stderr.getFullOutput();
        expect(fullOutput).not.toContain('76.76.21.21');
      });

      it('treats a domain already assigned to the same project as success', async () => {
        useUser();
        const domain = useDomain();
        const { project } = useProject();
        client.setArgv('domains', 'add', domain.name, String(project.name));
        client.scenario.post(`/projects/${project.name}/alias`, (_req, res) => {
          res.status(400).json({
            error: {
              code: 'ALIAS_DOMAIN_EXIST',
              message: `Cannot add ${domain.name} since it's already assigned to another project.`,
              project: { id: project.id, name: project.name },
            },
          });
        });
        client.scenario.get(`/:version/domains/${domain.name}`, (_req, res) => {
          res.json({ domain });
        });
        client.scenario.get(
          `/:version/domains/${domain.name}/config`,
          (_req, res) => {
            res.json({});
          }
        );
        const exitCode = await domains(client);
        expect(exitCode, 'exit code for "domains"').toEqual(0);

        await expect(client.stderr).toOutput(
          `Domain ${domain.name} is already assigned to project ${project.name}`
        );
      });

      it('treats a domain already on the project as success when the API omits the conflicting project', async () => {
        useUser();
        const domain = useDomain();
        const { project } = useProject();
        client.setArgv('domains', 'add', domain.name, String(project.name));
        client.scenario.post(`/projects/${project.name}/alias`, (_req, res) => {
          res.status(400).json({
            error: {
              code: 'ALIAS_DOMAIN_EXIST',
              message: `Cannot add ${domain.name} since it's already assigned to another project.`,
            },
          });
        });
        // The domain is in fact attached to the requested project.
        client.scenario.get(
          `/v9/projects/${project.name}/domains/${domain.name}`,
          (_req, res) => {
            res.json({
              name: domain.name,
              apexName: domain.name,
              projectId: project.id,
              verified: true,
            });
          }
        );
        client.scenario.get(`/:version/domains/${domain.name}`, (_req, res) => {
          res.json({ domain });
        });
        client.scenario.get(
          `/:version/domains/${domain.name}/config`,
          (_req, res) => {
            res.json({});
          }
        );
        const exitCode = await domains(client);
        expect(exitCode, 'exit code for "domains"').toEqual(0);

        await expect(client.stderr).toOutput(
          `Domain ${domain.name} is already assigned to project ${project.name}`
        );
      });

      it('scopes the alias mutation to the linked team, not the ambient team', async () => {
        // Directory linked to a project owned by team_linked, but the ambient
        // scope is a stale team. The alias mutation must be scoped to the
        // linked team so a same-name project in the stale team is not hit.
        useUser();
        useTeam('team_stale');
        useTeam('team_linked');
        const domain = useDomain();

        const cwd = setupTmpDir();
        client.cwd = cwd;
        await outputFile(
          join(cwd, '.vercel', 'project.json'),
          JSON.stringify({ projectId: 'prj_linked', orgId: 'team_linked' })
        );

        useProject({
          ...defaultProject,
          id: 'prj_linked',
          name: 'my-app',
          accountId: 'team_linked',
        });

        client.config.currentTeam = 'team_stale';
        client.setArgv('domains', 'add', domain.name, 'my-app');

        let aliasTeamId: string | undefined;
        client.scenario.post('/projects/:idOrName/alias', (req, res) => {
          aliasTeamId =
            typeof req.query.teamId === 'string' ? req.query.teamId : undefined;
          res.json([{ domain: domain.name }]);
        });
        client.scenario.get(
          `/:version/domains/${domain.name}/config`,
          (_req, res) => {
            res.json({});
          }
        );

        const exitCode = await domains(client);
        expect(exitCode, 'exit code for "domains"').toEqual(0);

        // Fixed behavior: the alias mutation is sent under the linked team, so
        // it can never resolve `my-app` in the stale ambient team.
        expect(aliasTeamId).toEqual('team_linked');
      });

      describe('--force', () => {
        it.each([
          { machine: false, phase: 'add' },
          { machine: true, phase: 'add' },
          { machine: false, phase: 'remove' },
          { machine: true, phase: 'remove' },
          { machine: false, phase: 'network' },
          { machine: true, phase: 'network' },
        ])('reports completed removal only when it happened ($phase failure, machine=$machine)', async ({
          machine,
          phase,
        }) => {
          useUser();
          const domain = useDomain();
          const { project } = useProject();
          client.setArgv(
            'domains',
            'add',
            domain.name,
            String(project.name),
            '--force'
          );
          client.nonInteractive = machine;
          const exitSpy = machine
            ? vi.spyOn(process, 'exit').mockImplementation((() => {
                throw new Error('exit');
              }) as () => never)
            : undefined;
          const originalAdd = addDomainModule.addDomainToProject;
          let attempts = 0;
          const addSpy = vi
            .spyOn(addDomainModule, 'addDomainToProject')
            .mockImplementation(async (...args) => {
              attempts++;
              if (attempts === 2 && phase === 'network')
                throw new Error('Connection lost');
              return originalAdd(...args);
            });
          let posts = 0;
          client.scenario.post(
            `/projects/${project.name}/alias`,
            (_req, res) => {
              posts++;
              res.status(400).json({
                error:
                  posts === 1
                    ? {
                        code: 'ALIAS_DOMAIN_EXIST',
                        message: 'Already assigned',
                        project: { id: 'prj_previous', name: 'previous' },
                      }
                    : {
                        code: 'invalid_request',
                        message: 'Destination rejected',
                      },
              });
            }
          );
          client.scenario.get(
            `/v9/projects/${project.name}/domains/${domain.name}`,
            (_req, res) => {
              res
                .status(404)
                .json({ error: { code: 'not_found', message: 'Not found' } });
            }
          );
          let removals = 0;
          client.scenario.delete(
            '/projects/prj_previous/alias',
            (_req, res) => {
              removals++;
              if (phase === 'remove') {
                res.status(403).json({
                  error: { code: 'forbidden', message: 'Removal denied' },
                });
              } else {
                res.json([]);
              }
            }
          );
          try {
            if (machine) await expect(domains(client)).rejects.toThrow('exit');
            else expect(await domains(client)).toEqual(1);
            expect(removals).toEqual(1);
            expect(attempts).toEqual(phase === 'remove' ? 1 : 2);
            const text = machine
              ? (JSON.parse(client.stdout.getFullOutput()).hint ?? '')
              : client.stderr.getFullOutput();
            if (phase === 'remove') {
              expect(text).not.toContain(
                'Removed the previous project assignment'
              );
            } else {
              expect(text).toContain('Removed the previous project assignment');
              expect(text).toContain(
                'could not confirm the destination assignment'
              );
              expect(text).toContain(
                'Inspect the current assignment before retrying'
              );
            }
            if (machine) {
              const payload = JSON.parse(client.stdout.getFullOutput());
              expect(payload.status).toEqual('error');
              expect(payload.reason).toEqual(
                phase === 'remove'
                  ? 'domain_remove_failed'
                  : 'domain_add_failed'
              );
              expect(payload.message).toContain(
                phase === 'network'
                  ? 'Connection lost'
                  : phase === 'remove'
                    ? 'Removal denied'
                    : 'Destination rejected'
              );
              if (phase !== 'remove') {
                expect(payload.next).toHaveLength(1);
                expect(payload.next[0].command).toContain(
                  `domains inspect ${domain.name}`
                );
                expect(payload.next[0].command).not.toContain('domains add');
              }
            }
          } finally {
            client.nonInteractive = false;
            exitSpy?.mockRestore();
            addSpy.mockRestore();
          }
        });

        it('tracks telemetry data', async () => {
          useUser();
          const domain = useDomain();
          const { project } = useProject();
          client.setArgv(
            'domains',
            'add',
            '--force',
            domain.name,
            String(project.name)
          );
          client.scenario.post(
            `/projects/${project.name}/alias`,
            (_req, res) => {
              res.json([{ domain: domain.name }]);
            }
          );
          client.scenario.get(
            `/:version/domains/${domain.name}`,
            (_req, res) => {
              res.json({});
            }
          );
          client.scenario.get(
            `/:version/domains/${domain.name}/config`,
            (_req, res) => {
              res.json({});
            }
          );
          const exitCode = await domains(client);
          expect(exitCode, 'exit code for "domains"').toEqual(0);

          expect(client.telemetryEventStore).toHaveTelemetryEvents([
            {
              key: 'subcommand:add',
              value: 'add',
            },
            {
              key: 'flag:force',
              value: 'TRUE',
            },
            {
              key: 'argument:domain',
              value: '[REDACTED]',
            },
            {
              key: 'argument:project',
              value: '[REDACTED]',
            },
          ]);
        });

        it('moves the domain from another project even when the API omits the conflicting project', async () => {
          useUser();
          const domain = useDomain();
          const { project } = useProject();
          const otherProjectId = 'prj_other';
          client.setArgv(
            'domains',
            'add',
            '--force',
            domain.name,
            String(project.name)
          );

          let aliasPostCount = 0;
          client.scenario.post(
            `/projects/${project.name}/alias`,
            (_req, res) => {
              aliasPostCount += 1;
              if (aliasPostCount === 1) {
                res.status(400).json({
                  error: {
                    code: 'ALIAS_DOMAIN_EXIST',
                    message: `Cannot add ${domain.name} since it's already assigned to another project.`,
                  },
                });
                return;
              }
              res.json([{ domain: domain.name }]);
            }
          );
          // Domain is not attached to the requested project.
          client.scenario.get(
            `/v9/projects/${project.name}/domains/${domain.name}`,
            (_req, res) => {
              res.status(404).json({
                error: { code: 'not_found', message: 'Not found' },
              });
            }
          );
          // Domain is currently attached to a different project.
          client.scenario.get(
            `/project-domains/${domain.name}`,
            (_req, res) => {
              res.json({
                name: domain.name,
                apexName: domain.name,
                projectId: otherProjectId,
                verified: true,
              });
            }
          );
          let removeCalled = false;
          client.scenario.delete(
            `/projects/${otherProjectId}/alias`,
            (_req, res) => {
              removeCalled = true;
              res.json([]);
            }
          );
          client.scenario.get(
            `/:version/domains/${domain.name}`,
            (_req, res) => {
              res.json({ domain });
            }
          );
          client.scenario.get(
            `/:version/domains/${domain.name}/config`,
            (_req, res) => {
              res.json({});
            }
          );

          const exitCode = await domains(client);
          expect(exitCode, 'exit code for "domains"').toEqual(0);
          expect(removeCalled, 'removed domain from other project').toEqual(
            true
          );

          await expect(client.stderr).toOutput(
            `Domain ${domain.name} added to project ${project.name}`
          );
        });
      });
    });

    describe('non-interactive mode', () => {
      it('emits a structured success payload with next when adding to a team', async () => {
        useUser();
        const domain = useDomain();
        const exitSpy = vi
          .spyOn(process, 'exit')
          .mockImplementation((() => undefined) as never);
        client.nonInteractive = true;
        client.setArgv('domains', 'add', domain.name, '--non-interactive');
        client.scenario.post('/v7/domains', (_req, res) => {
          res.json({ domain });
        });

        await domains(client);

        const payload = JSON.parse(client.stdout.getFullOutput());
        expect(payload.status).toBe('success');
        expect(payload.reason).toBe('domain_added');
        const commands = (payload.next ?? []).map(
          (n: { command: string }) => n.command
        );
        expect(
          commands.some((c: string) =>
            c.includes(`domains add ${domain.name} <project>`)
          )
        ).toBe(true);
        expect(exitSpy).toHaveBeenCalledWith(0);

        exitSpy.mockRestore();
        client.nonInteractive = false;
      });

      it('emits a structured success payload pointing to verify when adding to a project', async () => {
        useUser();
        const domain = useDomain();
        const { project } = useProject();
        const exitSpy = vi
          .spyOn(process, 'exit')
          .mockImplementation((() => undefined) as never);
        client.nonInteractive = true;
        client.setArgv(
          'domains',
          'add',
          domain.name,
          String(project.name),
          '--non-interactive'
        );
        client.scenario.post(`/projects/${project.name}/alias`, (_req, res) => {
          res.json([{ domain: domain.name }]);
        });
        // Reached only because the test mocks process.exit to a no-op; in real
        // runtime outputAgentSuccess exits before this is called.
        client.scenario.get(
          `/:version/domains/${domain.name}/config`,
          (_req, res) => {
            res.json({});
          }
        );

        await domains(client);

        const payload = JSON.parse(client.stdout.getFullOutput());
        expect(payload.status).toBe('success');
        expect(payload.reason).toBe('domain_added');
        const commands = (payload.next ?? []).map(
          (n: { command: string }) => n.command
        );
        expect(
          commands.some((c: string) =>
            c.includes(`domains verify ${domain.name}`)
          )
        ).toBe(true);
        expect(exitSpy).toHaveBeenCalledWith(0);

        exitSpy.mockRestore();
        client.nonInteractive = false;
      });
    });
  });
});
