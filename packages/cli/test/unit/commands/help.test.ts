import { describe, expect, test, it } from 'vitest';
import {
  help,
  lineToString,
  outputArrayToString,
} from '../../../src/commands/help';
import { deployCommand } from '../../../src/commands/deploy/command';
import { aliasCommand } from '../../../src/commands/alias/command';
import { bisectCommand } from '../../../src/commands/bisect/command';
import { certsCommand } from '../../../src/commands/certs/command';
import { dnsCommand } from '../../../src/commands/dns/command';
import { domainsCommand } from '../../../src/commands/domains/command';
import { envCommand } from '../../../src/commands/env/command';
import { gitCommand } from '../../../src/commands/git/command';
import { initCommand } from '../../../src/commands/init/command';
import { inspectCommand } from '../../../src/commands/inspect/command';
import { linkCommand } from '../../../src/commands/link/command';
import { listCommand } from '../../../src/commands/list/command';
import { loginCommand } from '../../../src/commands/login/command';
import { projectCommand } from '../../../src/commands/project/command';
import { promoteCommand } from '../../../src/commands/promote/command';
import { pullCommand } from '../../../src/commands/pull/command';
import { redeployCommand } from '../../../src/commands/redeploy/command';
import { removeCommand } from '../../../src/commands/remove/command';
import { rollbackCommand } from '../../../src/commands/rollback/command';
import { teamsCommand } from '../../../src/commands/teams/command';
import { whoamiCommand } from '../../../src/commands/whoami/command';

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
      expect(help(aliasCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('alias help column width 80', () => {
      expect(help(aliasCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('alias help column width 120', () => {
      expect(help(aliasCommand, { columns: 120 })).toMatchSnapshot();
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
      expect(help(certsCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('certs help column width 80', () => {
      expect(help(certsCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('certs help column width 120', () => {
      expect(help(certsCommand, { columns: 120 })).toMatchSnapshot();
    });
  });

  describe('dns help output snapshots', () => {
    it('dns help column width 40', () => {
      expect(help(dnsCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('dns help column width 80', () => {
      expect(help(dnsCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('dns help column width 120', () => {
      expect(help(dnsCommand, { columns: 120 })).toMatchSnapshot();
    });
  });

  describe('domains help output snapshots', () => {
    it('domains help column width 40', () => {
      expect(help(domainsCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('domains help column width 80', () => {
      expect(help(domainsCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('domains help column width 120', () => {
      expect(help(domainsCommand, { columns: 120 })).toMatchSnapshot();
    });
  });

  describe('env help output snapshots', () => {
    it('env help column width 40', () => {
      expect(help(envCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('env help column width 80', () => {
      expect(help(envCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('env help column width 120', () => {
      expect(help(envCommand, { columns: 120 })).toMatchSnapshot();
    });
  });

  describe('git help output snapshots', () => {
    it('git help column width 40', () => {
      expect(help(gitCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('git help column width 80', () => {
      expect(help(gitCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('git help column width 120', () => {
      expect(help(gitCommand, { columns: 120 })).toMatchSnapshot();
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
      expect(help(projectCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('project help column width 80', () => {
      expect(help(projectCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('project help column width 120', () => {
      expect(help(projectCommand, { columns: 120 })).toMatchSnapshot();
    });
  });

  describe('promote help output snapshots', () => {
    it('promote help column width 40', () => {
      expect(help(promoteCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('promote help column width 80', () => {
      expect(help(promoteCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('promote help column width 120', () => {
      expect(help(promoteCommand, { columns: 120 })).toMatchSnapshot();
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
      expect(help(rollbackCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('rollback help column width 80', () => {
      expect(help(rollbackCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('rollback help column width 120', () => {
      expect(help(rollbackCommand, { columns: 120 })).toMatchSnapshot();
    });
  });

  describe('teams help output snapshots', () => {
    it('teams help column width 40', () => {
      expect(help(teamsCommand, { columns: 40 })).toMatchSnapshot();
    });
    it('teams help column width 80', () => {
      expect(help(teamsCommand, { columns: 80 })).toMatchSnapshot();
    });
    it('teams help column width 120', () => {
      expect(help(teamsCommand, { columns: 120 })).toMatchSnapshot();
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
