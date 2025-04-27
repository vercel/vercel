import { describe, expect, test, it } from 'vitest';
import {
  help,
  lineToString,
  outputArrayToString,
} from '../../../src/commands/help';
import { deployCommand } from '../../../src/commands/deploy/command';
import * as alias from '../../../src/commands/alias/command';
import { bisectCommand } from '../../../src/commands/bisect/command';
import * as certs from '../../../src/commands/certs/command';
import * as dns from '../../../src/commands/dns/command';
import * as domains from '../../../src/commands/domains/command';
import * as env from '../../../src/commands/env/command';
import * as git from '../../../src/commands/git/command';
import { initCommand } from '../../../src/commands/init/command';
import { inspectCommand } from '../../../src/commands/inspect/command';
import * as integration from '../../../src/commands/integration/command';
import * as integrationResource from '../../../src/commands/integration-resource/command';
import { linkCommand } from '../../../src/commands/link/command';
import { listCommand } from '../../../src/commands/list/command';
import { loginCommand } from '../../../src/commands/login/command';
import * as project from '../../../src/commands/project/command';
import * as promote from '../../../src/commands/promote/command';
import { pullCommand } from '../../../src/commands/pull/command';
import { redeployCommand } from '../../../src/commands/redeploy/command';
import { removeCommand } from '../../../src/commands/remove/command';
import * as rollback from '../../../src/commands/rollback/command';
import * as target from '../../../src/commands/target/command';
import * as teams from '../../../src/commands/teams/command';
import * as telemetry from '../../../src/commands/telemetry/command';
import { whoamiCommand } from '../../../src/commands/whoami/command';
import dev from '../../../src/commands/dev';
import { client } from '../../mocks/client';

describe('help command', () => {
  describe('lineToString', () => {
    test.each([
      {
        line: ['a', 'b', 'c'],
        expected: 'a b c',
      },
      {
        line: [' ', 'a', ' ', 'b', ' ', 'c', ' '],
        expected: ' a b c ',
      },
      {
        line: [' ', '  ', '   '],
        expected: '      ',
      },
      {
        line: ['a', '  ', '   ', 'b', 'c'],
        expected: 'a     b c',
      },
    ])(
      'should insert spaces between non-whitespace items only; $line',
      ({ line, expected }) => {
        expect(lineToString(line)).toBe(expected);
      }
    );
  });

  describe('outputArrayToString', () => {
    test('should join a list of strings using newlines', () => {
      expect(outputArrayToString(['line 1', 'line 2', 'line 3'])).toBe(
        'line 1\nline 2\nline 3'
      );
    });
  });

  describe('dev help output snapshots', () => {
    describe.todo('help dev');
    describe('dev --help', async () => {
      it('outputs help', async () => {
        client.setArgv('dev', '--help');
        const exitCode = await dev(client);
        expect(exitCode).toEqual(2);
        expect(client.stderr.read()).toMatchSnapshot();
      });
    });
  });

  describe('deploy help output snapshots', () => {
    it('deploy help column width 40', () => {
      expect(help(deployCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('deploy help column width 80', () => {
      expect(help(deployCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('deploy help column width 120', () => {
      expect(help(deployCommand, { columns: 120 })).toMatchSnapshot();
    });
  });

  describe('alias help output snapshots', () => {
    it('alias help column width 40', () => {
      expect(help(alias.aliasCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('alias help column width 80', () => {
      expect(help(alias.aliasCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('alias help column width 120', () => {
      expect(help(alias.aliasCommand, { columns: 120 })).toMatchSnapshot();
    });

    describe('alias list subcommand', () => {
      it('alias list subcommand help column width 120', () => {
        expect(
          help(alias.listSubcommand, {
            columns: 120,
            parent: alias.aliasCommand,
          })
        ).toMatchSnapshot();
      });
    });

    describe('alias remove subcommand', () => {
      it('alias remove subcommand help column width 120', () => {
        expect(
          help(alias.removeSubcommand, {
            columns: 120,
            parent: alias.aliasCommand,
          })
        ).toMatchSnapshot();
      });
    });

    describe('alias set subcommand', () => {
      it('alias set subcommand help column width 120', () => {
        expect(
          help(alias.setSubcommand, {
            columns: 120,
            parent: alias.aliasCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('bisect help output snapshots', () => {
    it('bisect help column width 40', () => {
      expect(help(bisectCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('bisect help column width 80', () => {
      expect(help(bisectCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('bisect help column width 120', () => {
      expect(help(bisectCommand, { columns: 120 })).toMatchSnapshot();
    });
  });

  describe('certs help output snapshots', () => {
    it('certs help column width 40', () => {
      expect(help(certs.certsCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('certs help column width 80', () => {
      expect(help(certs.certsCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('certs help column width 120', () => {
      expect(help(certs.certsCommand, { columns: 120 })).toMatchSnapshot();
    });
    describe('certs add help output snapshots', () => {
      it('certs add help column width 120', () => {
        expect(
          help(certs.addSubcommand, {
            columns: 120,
            parent: certs.certsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('certs issue help output snapshots', () => {
      it('certs issue help column width 120', () => {
        expect(
          help(certs.issueSubcommand, {
            columns: 120,
            parent: certs.certsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('certs list help output snapshots', () => {
      it('certs list help column width 120', () => {
        expect(
          help(certs.listSubcommand, {
            columns: 120,
            parent: certs.certsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('certs remove help output snapshots', () => {
      it('certs remove help column width 120', () => {
        expect(
          help(certs.removeSubcommand, {
            columns: 120,
            parent: certs.certsCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('dns help output snapshots', () => {
    it('dns help column width 40', () => {
      expect(help(dns.dnsCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('dns help column width 80', () => {
      expect(help(dns.dnsCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('dns help column width 120', () => {
      expect(help(dns.dnsCommand, { columns: 120 })).toMatchSnapshot();
    });
    describe('dns add help output snapshots', () => {
      it('dns add help column width 120', () => {
        expect(
          help(dns.addSubcommand, { columns: 120, parent: dns.dnsCommand })
        ).toMatchSnapshot();
      });
    });
    describe('dns import help output snapshots', () => {
      it('dns import help column width 120', () => {
        expect(
          help(dns.importSubcommand, { columns: 120, parent: dns.dnsCommand })
        ).toMatchSnapshot();
      });
    });
    describe('dns list help output snapshots', () => {
      it('dns list help column width 120', () => {
        expect(
          help(dns.listSubcommand, { columns: 120, parent: dns.dnsCommand })
        ).toMatchSnapshot();
      });
    });
    describe('dns remove help output snapshots', () => {
      it('dns remove help column width 120', () => {
        expect(
          help(dns.removeSubcommand, { columns: 120, parent: dns.dnsCommand })
        ).toMatchSnapshot();
      });
    });
  });

  describe('domains help output snapshots', () => {
    it('domains help column width 40', () => {
      expect(help(domains.domainsCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('domains help column width 80', () => {
      expect(help(domains.domainsCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('domains help column width 120', () => {
      expect(help(domains.domainsCommand, { columns: 120 })).toMatchSnapshot();
    });
    describe('domains add help output snapshots', () => {
      it('domains add help column width 120', () => {
        expect(
          help(domains.addSubcommand, {
            columns: 120,
            parent: domains.domainsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('domains buy help output snapshots', () => {
      it('domains buy help column width 120', () => {
        expect(
          help(domains.buySubcommand, {
            columns: 120,
            parent: domains.domainsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('domains inspect help output snapshots', () => {
      it('domains inspect help column width 120', () => {
        expect(
          help(domains.inspectSubcommand, {
            columns: 120,
            parent: domains.domainsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('domains list help output snapshots', () => {
      it('domains list help column width 120', () => {
        expect(
          help(domains.listSubcommand, {
            columns: 120,
            parent: domains.domainsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('domains move help output snapshots', () => {
      it('domains move help column width 120', () => {
        expect(
          help(domains.moveSubcommand, {
            columns: 120,
            parent: domains.domainsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('domains remove help output snapshots', () => {
      it('domains remove help column width 120', () => {
        expect(
          help(domains.removeSubcommand, {
            columns: 120,
            parent: domains.domainsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('domains transfer-in help output snapshots', () => {
      it('domains transfer-in help column width 120', () => {
        expect(
          help(domains.transferInSubcommand, {
            columns: 120,
            parent: domains.domainsCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('env help output snapshots', () => {
    it('env help column width 40', () => {
      expect(help(env.envCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('env help column width 80', () => {
      expect(help(env.envCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('env help column width 120', () => {
      expect(help(env.envCommand, { columns: 120 })).toMatchSnapshot();
    });
    describe('env add help output snapshots', () => {
      it('env add help column width 120', () => {
        expect(
          help(env.addSubcommand, { columns: 120, parent: env.envCommand })
        ).toMatchSnapshot();
      });
    });
    describe('env list help output snapshots', () => {
      it('env list help column width 120', () => {
        expect(
          help(env.listSubcommand, { columns: 120, parent: env.envCommand })
        ).toMatchSnapshot();
      });
    });
    describe('env pull help output snapshots', () => {
      it('env pull help column width 120', () => {
        expect(
          help(env.pullSubcommand, { columns: 120, parent: env.envCommand })
        ).toMatchSnapshot();
      });
    });
    describe('env remove help output snapshots', () => {
      it('env remove help column width 120', () => {
        expect(
          help(env.removeSubcommand, { columns: 120, parent: env.envCommand })
        ).toMatchSnapshot();
      });
    });
  });

  describe('git help output snapshots', () => {
    it('git help column width 40', () => {
      expect(help(git.gitCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('git help column width 80', () => {
      expect(help(git.gitCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('git help column width 120', () => {
      expect(help(git.gitCommand, { columns: 120 })).toMatchSnapshot();
    });
    describe('git connect help output snapshots', () => {
      it('git connect help column width 120', () => {
        expect(
          help(git.connectSubcommand, { columns: 120, parent: git.gitCommand })
        ).toMatchSnapshot();
      });
    });
    describe('git disconnect help output snapshots', () => {
      it('git disconnect help column width 120', () => {
        expect(
          help(git.disconnectSubcommand, {
            columns: 120,
            parent: git.gitCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('init help output snapshots', () => {
    it('init help column width 40', () => {
      expect(help(initCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('init help column width 80', () => {
      expect(help(initCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('init help column width 120', () => {
      expect(help(initCommand, { columns: 120 })).toMatchSnapshot();
    });
  });

  describe('inspect help output snapshots', () => {
    it('inspect help column width 40', () => {
      expect(help(inspectCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('inspect help column width 80', () => {
      expect(help(inspectCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('inspect help column width 120', () => {
      expect(help(inspectCommand, { columns: 120 })).toMatchSnapshot();
    });
  });

  describe('integration help output snapshots', () => {
    it('integration help column width 40', () => {
      expect(
        help(integration.integrationCommand, { columns: 40 })
      ).toMatchSnapshot();
    });
    it('integration help column width 80', () => {
      expect(
        help(integration.integrationCommand, { columns: 80 })
      ).toMatchSnapshot();
    });
    it('integration help column width 120', () => {
      expect(
        help(integration.integrationCommand, { columns: 120 })
      ).toMatchSnapshot();
    });
    describe('integration list subcommand', () => {
      it('integration list subcommand help column width 120', () => {
        expect(
          help(integration.listSubcommand, {
            columns: 120,
            parent: integration.integrationCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('integration-resource help output snapshots', () => {
    it('integration-resource help column width 40', () => {
      expect(
        help(integrationResource.integrationResourceCommand, { columns: 40 })
      ).toMatchSnapshot();
    });
    it('integration-resource help column width 80', () => {
      expect(
        help(integrationResource.integrationResourceCommand, { columns: 80 })
      ).toMatchSnapshot();
    });
    it('integration-resource help column width 120', () => {
      expect(
        help(integrationResource.integrationResourceCommand, { columns: 120 })
      ).toMatchSnapshot();
    });
    describe('integration-resource disconnect subcommand', () => {
      it('integration-resource disconnect subcommand help column width 120', () => {
        expect(
          help(integrationResource.disconnectSubcommand, {
            columns: 120,
            parent: integrationResource.integrationResourceCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('integration-resource remove subcommand', () => {
      it('integration-resource remove subcommand help column width 120', () => {
        expect(
          help(integrationResource.removeSubcommand, {
            columns: 120,
            parent: integrationResource.integrationResourceCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('link help output snapshots', () => {
    it('link help column width 40', () => {
      expect(help(linkCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('link help column width 80', () => {
      expect(help(linkCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('link help column width 120', () => {
      expect(help(linkCommand, { columns: 120 })).toMatchSnapshot();
    });
  });

  describe('list help output snapshots', () => {
    it('list help column width 40', () => {
      expect(help(listCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('list help column width 80', () => {
      expect(help(listCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('list help column width 120', () => {
      expect(help(listCommand, { columns: 120 })).toMatchSnapshot();
    });
  });

  describe('login help output snapshots', () => {
    it('login help column width 40', () => {
      expect(help(loginCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('login help column width 80', () => {
      expect(help(loginCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('login help column width 120', () => {
      expect(help(loginCommand, { columns: 120 })).toMatchSnapshot();
    });
  });

  describe('project help output snapshots', () => {
    it('project help column width 40', () => {
      expect(help(project.projectCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('project help column width 80', () => {
      expect(help(project.projectCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('project help column width 120', () => {
      expect(help(project.projectCommand, { columns: 120 })).toMatchSnapshot();
    });
    describe('project add help output snapshots', () => {
      it('project add help column width 120', () => {
        expect(
          help(project.addSubcommand, {
            columns: 120,
            parent: project.projectCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('project inspect help output snapshots', () => {
      it('project inspect help column width 120', () => {
        expect(
          help(project.inspectSubcommand, {
            columns: 120,
            parent: project.projectCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('project list help output snapshots', () => {
      it('project list help column width 120', () => {
        expect(
          help(project.listSubcommand, {
            columns: 120,
            parent: project.projectCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('project remove help output snapshots', () => {
      it('project remove help column width 120', () => {
        expect(
          help(project.removeSubcommand, {
            columns: 120,
            parent: project.projectCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('promote help output snapshots', () => {
    it('promote help column width 40', () => {
      expect(help(promote.promoteCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('promote help column width 80', () => {
      expect(help(promote.promoteCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('promote help column width 120', () => {
      expect(help(promote.promoteCommand, { columns: 120 })).toMatchSnapshot();
    });
    describe('promote status help output snapshots', () => {
      it('promote status help column width 120', () => {
        expect(
          help(promote.statusSubcommand, {
            columns: 120,
            parent: promote.promoteCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('pull help output snapshots', () => {
    it('pull help column width 40', () => {
      expect(help(pullCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('pull help column width 80', () => {
      expect(help(pullCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('pull help column width 120', () => {
      expect(help(pullCommand, { columns: 120 })).toMatchSnapshot();
    });
  });

  describe('redeploy help output snapshots', () => {
    it('redeploy help column width 40', () => {
      expect(help(redeployCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('redeploy help column width 80', () => {
      expect(help(redeployCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('redeploy help column width 120', () => {
      expect(help(redeployCommand, { columns: 120 })).toMatchSnapshot();
    });
  });

  describe('remove help output snapshots', () => {
    it('remove help column width 40', () => {
      expect(help(removeCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('remove help column width 80', () => {
      expect(help(removeCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('remove help column width 120', () => {
      expect(help(removeCommand, { columns: 120 })).toMatchSnapshot();
    });
  });

  describe('rollback help output snapshots', () => {
    it('rollback help column width 40', () => {
      expect(help(rollback.rollbackCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('rollback help column width 80', () => {
      expect(help(rollback.rollbackCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('rollback help column width 120', () => {
      expect(
        help(rollback.rollbackCommand, { columns: 120 })
      ).toMatchSnapshot();
    });
    describe('rollback status help output snapshots', () => {
      it('rollback status help column width 120', () => {
        expect(
          help(rollback.rollbackCommand, { columns: 120 })
        ).toMatchSnapshot();
      });
    });
  });

  describe('target help output snapshots', () => {
    it('target help column width 40', () => {
      expect(help(target.targetCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('target help column width 80', () => {
      expect(help(target.targetCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('target help column width 120', () => {
      expect(help(target.targetCommand, { columns: 120 })).toMatchSnapshot();
    });
    describe('target list help output snapshots', () => {
      it('target list help column width 120', () => {
        expect(
          help(target.listSubcommand, {
            columns: 120,
            parent: target.targetCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('teams help output snapshots', () => {
    it('teams help column width 40', () => {
      expect(help(teams.teamsCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('teams help column width 80', () => {
      expect(help(teams.teamsCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('teams help column width 120', () => {
      expect(help(teams.teamsCommand, { columns: 120 })).toMatchSnapshot();
    });
    describe('teams add help output snapshots', () => {
      it('teams add help column width 120', () => {
        expect(
          help(teams.addSubcommand, {
            columns: 120,
            parent: teams.teamsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('teams list help output snapshots', () => {
      it('teams list help column width 120', () => {
        expect(
          help(teams.listSubcommand, {
            columns: 120,
            parent: teams.teamsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('teams invite help output snapshots', () => {
      it('teams invite help column width 120', () => {
        expect(
          help(teams.inviteSubcommand, {
            columns: 120,
            parent: teams.teamsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('teams switch help output snapshots', () => {
      it('teams switch help column width 120', () => {
        expect(
          help(teams.switchSubcommand, {
            columns: 120,
            parent: teams.teamsCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('telemetry help output snapshots', () => {
    it('telemetry help column width 40', () => {
      expect(
        help(telemetry.telemetryCommand, { columns: 40 })
      ).toMatchSnapshot();
    });
    it('telemetry help column width 80', () => {
      expect(
        help(telemetry.telemetryCommand, { columns: 80 })
      ).toMatchSnapshot();
    });
    it('telemetry help column width 120', () => {
      expect(
        help(telemetry.telemetryCommand, { columns: 120 })
      ).toMatchSnapshot();
    });
    describe('telemetry status help output snapshots', () => {
      it('telemetry status help column width 120', () => {
        expect(
          help(telemetry.statusSubcommand, {
            columns: 120,
            parent: telemetry.telemetryCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('telemetry enable help output snapshots', () => {
      it('telemetry enable help column width 120', () => {
        expect(
          help(telemetry.enableSubcommand, {
            columns: 120,
            parent: telemetry.telemetryCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('telemetry disable help output snapshots', () => {
      it('telemetry disable help column width 120', () => {
        expect(
          help(telemetry.disableSubcommand, {
            columns: 120,
            parent: telemetry.telemetryCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('whoami help output snapshots', () => {
    it('whoami help column width 40', () => {
      expect(help(whoamiCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('whoami help column width 80', () => {
      expect(help(whoamiCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('whoami help column width 120', () => {
      expect(help(whoamiCommand, { columns: 120 })).toMatchSnapshot();
    });
  });
});
