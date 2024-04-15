import { describe, expect, test } from 'vitest';
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
    test.each([40, 80, 120])('deploy help column width %i', width => {
      expect(help(deployCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('alias help output snapshots', () => {
    test.each([40, 80, 120])('alias help column width %i', width => {
      expect(help(aliasCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('bisect help output snapshots', () => {
    test.each([40, 80, 120])('bisect help column width %i', width => {
      expect(help(bisectCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('certs help output snapshots', () => {
    test.each([40, 80, 120])('certs help column width %i', width => {
      expect(help(certsCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('dns help output snapshots', () => {
    test.each([40, 80, 120])('dns help column width %i', width => {
      expect(help(dnsCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('domains help output snapshots', () => {
    test.each([40, 80, 120])('domains help column width %i', width => {
      expect(help(domainsCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('env help output snapshots', () => {
    test.each([40, 80, 120])('env help column width %i', width => {
      expect(help(envCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('git help output snapshots', () => {
    test.each([40, 80, 120])('git help column width %i', width => {
      expect(help(gitCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('init help output snapshots', () => {
    test.each([40, 80, 120])('init help column width %i', width => {
      expect(help(initCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('inspect help output snapshots', () => {
    test.each([40, 80, 120])('inspect help column width %i', width => {
      expect(help(inspectCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('link help output snapshots', () => {
    test.each([40, 80, 120])('link help column width %i', width => {
      expect(help(linkCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('list help output snapshots', () => {
    test.each([40, 80, 120])('list help column width %i', width => {
      expect(help(listCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('login help output snapshots', () => {
    test.each([40, 80, 120])('login help column width %i', width => {
      expect(help(loginCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('project help output snapshots', () => {
    test.each([40, 80, 120])('project help column width %i', width => {
      expect(help(projectCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('promote help output snapshots', () => {
    test.each([40, 80, 120])('promote help column width %i', width => {
      expect(help(promoteCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('pull help output snapshots', () => {
    test.each([40, 80, 120])('pull help column width %i', width => {
      expect(help(pullCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('redeploy help output snapshots', () => {
    test.each([40, 80, 120])('redeploy help column width %i', width => {
      expect(help(redeployCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('remove help output snapshots', () => {
    test.each([40, 80, 120])('remove help column width %i', width => {
      expect(help(removeCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('rollback help output snapshots', () => {
    test.each([40, 80, 120])('rollback help column width %i', width => {
      expect(help(rollbackCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('teams help output snapshots', () => {
    test.each([40, 80, 120])('teams help column width %i', width => {
      expect(help(teamsCommand, { columns: width })).toMatchSnapshot();
    });
  });

  describe('whoami help output snapshots', () => {
    test.each([40, 80, 120])('whoami help column width %i', width => {
      expect(help(whoamiCommand, { columns: width })).toMatchSnapshot();
    });
  });
});
