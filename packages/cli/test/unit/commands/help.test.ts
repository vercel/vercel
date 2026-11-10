import { describe, expect, test, it } from 'vitest';
import stripAnsi from 'strip-ansi';
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
import * as routes from '../../../src/commands/routes/command';
import * as storage from '../../../src/commands/storage/command';
import * as env from '../../../src/commands/env/command';
import * as comments from '../../../src/commands/comments/command';
import { blobCommand } from '../../../src/commands/blob/command';
import * as cache from '../../../src/commands/cache/command';
import * as deployHooks from '../../../src/commands/deploy-hooks/command';
import { upgradeCommand } from '../../../src/commands/upgrade/command';
import * as git from '../../../src/commands/git/command';
import { initCommand } from '../../../src/commands/init/command';
import { inspectCommand } from '../../../src/commands/inspect/command';
import * as connex from '../../../src/commands/connex/command';
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
import { devCommand } from '../../../src/commands/dev/command';
import { client } from '../../mocks/client';

describe('help command', () => {
  it.each([
    40, 80, 120,
  ])('wraps help sections at %i columns after examples', columns => {
    const output = stripAnsi(
      help(
        {
          ...whoamiCommand,
          examples: [{ name: 'Example command', value: 'vercel whoami' }],
          helpSections: [
            {
              title: 'Lookup details',
              body: [
                'Lookup requires a matching root span in the same project within 30 minutes after the request-ID timestamp.',
                '',
                'Use the same project for search and get.',
              ],
            },
          ],
        },
        { stream: { isTTY: false }, columns }
      )
    );
    const section = output.slice(output.indexOf('Lookup details'));
    expect(output.indexOf('Lookup details')).toBeGreaterThan(
      output.indexOf('Example command')
    );
    expect(section.replace(/\s+/g, ' ')).toContain(
      'within 30 minutes after the request-ID timestamp.'
    );
    expect(section).toMatch(/timestamp\.[ ]*\n[ ]*\n {2}Use the same project/);
    expect(section.split('\n').every(line => line.length <= columns)).toBe(
      true
    );
  });

  it.each(
    (
      [
        [
          linkCommand,
          undefined,
          'per-directory project links take precedence',
          '',
        ],
        [
          blobCommand,
          undefined,
          'instead of OIDC or environment credentials',
          'Read_Write_Token',
        ],
        [pullCommand, undefined, 'into .vercel', 'from Vercel.'],
        [
          env.listSubcommand,
          env.envCommand,
          'including readable Environment Variable values',
          '',
        ],
        [
          integrationResource.disconnectSubcommand,
          integrationResource.integrationResourceCommand,
          'without deleting the resource',
          '',
        ],
        [
          comments.editSubcommand,
          comments.commentsCommand,
          'preserving its attachments',
          '',
        ],
        [
          cache.purgeSubcommand,
          cache.cacheCommand,
          'cdn, data, or all (default: all)',
          'Type of cache to purge',
        ],
        [
          cache.invalidateSubcommand,
          cache.cacheCommand,
          'stale for background revalidation',
          'Invalidate all cached content by tag',
        ],
        [
          cache.dangerouslyDeleteSubcommand,
          cache.cacheCommand,
          'cache misses block on revalidation',
          'Dangerously delete all cached content by tag',
        ],
        [
          deployHooks.createSubcommand,
          deployHooks.deployHooksCommand,
          'anyone with the URL can trigger a deployment',
          '',
        ],
        [
          deployHooks.listSubcommand,
          deployHooks.deployHooksCommand,
          'anyone with a hook URL can trigger a deployment',
          '',
        ],
        [
          upgradeCommand,
          undefined,
          'current global or native',
          'Upgrades the Vercel CLI to the latest version.',
        ],
      ] as const
    ).map(([command, parent, expected, stale]) => ({
      command,
      parent,
      expected,
      stale,
    }))
  )('describes the scope and effects of $command.name', ({
    command,
    parent,
    expected,
    stale,
  }) => {
    const text = help(command, {
      stream: { isTTY: false },
      columns: 120,
      parent,
    });
    expect(text.replace(/\s+/g, ' ')).toContain(expected);
    if (stale) expect(text).not.toContain(stale);
  });

  it('describes the target and local file effects of env pull', () => {
    const text = help(env.pullSubcommand, {
      stream: { isTTY: false },
      columns: 120,
      parent: env.envCommand,
    });
    expect(text).toContain('Pull Environment Variables into a local file');
    expect(text).toContain('check .gitignore');
    expect(text).not.toContain('removing an environment variable');
    expect(text).not.toContain('Pull all Development');
  });

  it('makes the whole routing draft the publication unit', () => {
    expect(
      help(routes.publishSubcommand, {
        stream: { isTTY: false },
        columns: 120,
        parent: routes.routesCommand,
      })
    ).toMatchSnapshot();
  });

  it.each([
    storage.connectSubcommand,
    storage.updateSubcommand,
    storage.disconnectSubcommand,
  ])('qualifies storage $name previews when variable names are unavailable', subcommand => {
    const text = help(subcommand, {
      stream: { isTTY: false },
      columns: 120,
      parent: storage.storageCommand,
    });
    expect(text.replace(/\s+/g, ' ')).toContain(
      'provider variable names may be unavailable'
    );
    expect(text).not.toContain('Preview the exact');
    expect(text).not.toContain('only after applying');
    if (subcommand === storage.connectSubcommand)
      expect(text).toMatchSnapshot();
  });

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
    ])('should insert spaces between non-whitespace items only; $line', ({
      line,
      expected,
    }) => {
      expect(lineToString(line)).toBe(expected);
    });
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
        expect(exitCode).toEqual(0);
        expect(stripAnsi(client.stderr.getFullOutput())).toMatchSnapshot();
      });

      it('leaves out the internal --tunnel', () => {
        expect(
          help(devCommand, { stream: { isTTY: false }, columns: 80 })
        ).not.toContain('--tunnel');
      });
    });
  });

  describe('deploy help output snapshots', () => {
    it('deploy help column width 40', () => {
      expect(
        help(deployCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('deploy help column width 80', () => {
      expect(
        help(deployCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('deploy help column width 120', () => {
      expect(
        help(deployCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
  });

  describe('alias help output snapshots', () => {
    it('alias help column width 40', () => {
      expect(
        help(alias.aliasCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('alias help column width 80', () => {
      expect(
        help(alias.aliasCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('alias help column width 120', () => {
      expect(
        help(alias.aliasCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });

    describe('alias list subcommand', () => {
      it('alias list subcommand help column width 120', () => {
        expect(
          help(alias.listSubcommand, {
            stream: { isTTY: false },
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
            stream: { isTTY: false },
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
            stream: { isTTY: false },
            columns: 120,
            parent: alias.aliasCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('bisect help output snapshots', () => {
    it('bisect help column width 40', () => {
      expect(
        help(bisectCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('bisect help column width 80', () => {
      expect(
        help(bisectCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('bisect help column width 120', () => {
      expect(
        help(bisectCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
  });

  describe('certs help output snapshots', () => {
    it('certs help column width 40', () => {
      expect(
        help(certs.certsCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('certs help column width 80', () => {
      expect(
        help(certs.certsCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('certs help column width 120', () => {
      expect(
        help(certs.certsCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
    describe('certs add help output snapshots', () => {
      it('certs add help column width 120', () => {
        expect(
          help(certs.addSubcommand, {
            stream: { isTTY: false },
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
            stream: { isTTY: false },
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
            stream: { isTTY: false },
            columns: 120,
            parent: certs.certsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('certs delete help output snapshots', () => {
      it('certs delete help column width 120', () => {
        expect(
          help(certs.removeSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: certs.certsCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('dns help output snapshots', () => {
    it('dns help column width 40', () => {
      expect(
        help(dns.dnsCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('dns help column width 80', () => {
      expect(
        help(dns.dnsCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('dns help column width 120', () => {
      expect(
        help(dns.dnsCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
    describe('dns add help output snapshots', () => {
      it('dns add help column width 120', () => {
        expect(
          help(dns.addSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: dns.dnsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('dns import help output snapshots', () => {
      it('dns import help column width 120', () => {
        expect(
          help(dns.importSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: dns.dnsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('dns list help output snapshots', () => {
      it('dns list help column width 120', () => {
        expect(
          help(dns.listSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: dns.dnsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('dns remove help output snapshots', () => {
      it('dns remove help column width 120', () => {
        expect(
          help(dns.removeSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: dns.dnsCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('domains help output snapshots', () => {
    it('domains help column width 40', () => {
      expect(
        help(domains.domainsCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('domains help column width 80', () => {
      expect(
        help(domains.domainsCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('domains help column width 120', () => {
      expect(
        help(domains.domainsCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
    describe('domains add help output snapshots', () => {
      it('domains add help column width 120', () => {
        expect(
          help(domains.addSubcommand, {
            stream: { isTTY: false },
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
            stream: { isTTY: false },
            columns: 120,
            parent: domains.domainsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('domains check help output snapshots', () => {
      it('domains check help column width 120', () => {
        expect(
          help(domains.checkSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: domains.domainsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('domains price help output snapshots', () => {
      it('domains price help column width 120', () => {
        expect(
          help(domains.priceSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: domains.domainsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('domains search help output snapshots', () => {
      it('domains search help column width 120', () => {
        expect(
          help(domains.searchSubcommand, {
            stream: { isTTY: false },
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
            stream: { isTTY: false },
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
            stream: { isTTY: false },
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
            stream: { isTTY: false },
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
            stream: { isTTY: false },
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
            stream: { isTTY: false },
            columns: 120,
            parent: domains.domainsCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('domains verify help output snapshots', () => {
      it('domains verify help column width 120', () => {
        expect(
          help(domains.verifySubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: domains.domainsCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('env help output snapshots', () => {
    it('env help column width 40', () => {
      expect(
        help(env.envCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('env help column width 80', () => {
      expect(
        help(env.envCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('env help column width 120', () => {
      expect(
        help(env.envCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
    describe('env add help output snapshots', () => {
      it('env add help column width 120', () => {
        expect(
          help(env.addSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: env.envCommand,
          }).replace(/[ \t]+$/gm, '')
        ).toMatchSnapshot();
      });
    });
    describe('env list help output snapshots', () => {
      it('env list help column width 120', () => {
        expect(
          help(env.listSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: env.envCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('env pull help output snapshots', () => {
      it('env pull help column width 120', () => {
        expect(
          help(env.pullSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: env.envCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('env remove help output snapshots', () => {
      it('env remove help column width 120', () => {
        expect(
          help(env.removeSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: env.envCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('git help output snapshots', () => {
    it('git help column width 40', () => {
      expect(
        help(git.gitCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('git help column width 80', () => {
      expect(
        help(git.gitCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('git help column width 120', () => {
      expect(
        help(git.gitCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
    describe('git connect help output snapshots', () => {
      it('git connect help column width 120', () => {
        expect(
          help(git.connectSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: git.gitCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('git disconnect help output snapshots', () => {
      it('git disconnect help column width 120', () => {
        expect(
          help(git.disconnectSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: git.gitCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('init help output snapshots', () => {
    it('init help column width 40', () => {
      expect(
        help(initCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('init help column width 80', () => {
      expect(
        help(initCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('init help column width 120', () => {
      expect(
        help(initCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
  });

  describe('inspect help output snapshots', () => {
    it('inspect help column width 40', () => {
      expect(
        help(inspectCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('inspect help column width 80', () => {
      expect(
        help(inspectCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('inspect help column width 120', () => {
      expect(
        help(inspectCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
  });

  describe('connex help output snapshots', () => {
    it('connex help column width 80', () => {
      expect(
        help(connex.connexCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    describe('connex create subcommand', () => {
      it('connex create subcommand help column width 120', () => {
        expect(
          help(connex.createSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: connex.connexCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('connex discover subcommand', () => {
      it('connex discover subcommand help column width 120', () => {
        expect(
          help(connex.discoverSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: connex.connexCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('connex categories subcommand', () => {
      it('connex categories subcommand help column width 120', () => {
        expect(
          help(connex.categoriesSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: connex.connexCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('connex list subcommand', () => {
      it('connex list subcommand help column width 120', () => {
        expect(
          help(connex.listSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: connex.connexCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('connex token subcommand', () => {
      it('connex token subcommand help column width 120', () => {
        expect(
          help(connex.tokenSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: connex.connexCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('connex open subcommand', () => {
      it('connex open subcommand help column width 120', () => {
        expect(
          help(connex.openSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: connex.connexCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('connex attach subcommand', () => {
      it('connex attach subcommand help column width 120', () => {
        expect(
          help(connex.attachSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: connex.connexCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('connex detach subcommand', () => {
      it('connex detach subcommand help column width 120', () => {
        expect(
          help(connex.detachSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: connex.connexCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('integration help output snapshots', () => {
    it('integration help column width 40', () => {
      expect(
        help(integration.integrationCommand, {
          stream: { isTTY: false },
          columns: 40,
        })
      ).toMatchSnapshot();
    });
    it('integration help column width 80', () => {
      expect(
        help(integration.integrationCommand, {
          stream: { isTTY: false },
          columns: 80,
        })
      ).toMatchSnapshot();
    });
    it('integration help column width 120', () => {
      expect(
        help(integration.integrationCommand, {
          stream: { isTTY: false },
          columns: 120,
        })
      ).toMatchSnapshot();
    });
    describe('integration list subcommand', () => {
      it('integration list subcommand help column width 120', () => {
        expect(
          help(integration.listSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: integration.integrationCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('integration accept-terms subcommand', () => {
      it('integration accept-terms subcommand help column width 120', () => {
        expect(
          help(integration.acceptTermsSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: integration.integrationCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('integration installations subcommand', () => {
      it('integration installations subcommand help column width 120', () => {
        expect(
          help(integration.installationsSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: integration.integrationCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('integration balance subcommand', () => {
      it('integration balance subcommand help column width 120', () => {
        expect(
          help(integration.balanceSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: integration.integrationCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('integration categories subcommand', () => {
      it('integration categories subcommand help column width 120', () => {
        expect(
          help(integration.categoriesSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: integration.integrationCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('integration guide subcommand', () => {
      it('integration guide subcommand help column width 120', () => {
        expect(
          help(integration.guideSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: integration.integrationCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('integration discover subcommand', () => {
      it('integration discover subcommand help column width 120', () => {
        expect(
          help(integration.discoverSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: integration.integrationCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('integration remove subcommand', () => {
      it('integration remove subcommand help column width 120', () => {
        expect(
          help(integration.removeSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: integration.integrationCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('integration update subcommand', () => {
      it('integration update subcommand help column width 120', () => {
        expect(
          help(integration.updateSubcommand, {
            stream: { isTTY: false },
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
        help(integrationResource.integrationResourceCommand, {
          stream: { isTTY: false },
          columns: 40,
        })
      ).toMatchSnapshot();
    });
    it('integration-resource help column width 80', () => {
      expect(
        help(integrationResource.integrationResourceCommand, {
          stream: { isTTY: false },
          columns: 80,
        })
      ).toMatchSnapshot();
    });
    it('integration-resource help column width 120', () => {
      expect(
        help(integrationResource.integrationResourceCommand, {
          stream: { isTTY: false },
          columns: 120,
        })
      ).toMatchSnapshot();
    });
    describe('integration-resource disconnect subcommand', () => {
      it('integration-resource disconnect subcommand help column width 120', () => {
        expect(
          help(integrationResource.disconnectSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: integrationResource.integrationResourceCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('integration-resource delete subcommand', () => {
      it('integration-resource delete subcommand help column width 120', () => {
        expect(
          help(integrationResource.removeSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: integrationResource.integrationResourceCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('integration-resource create-threshold subcommand', () => {
      it('integration-resource create-threshold subcommand help column width 120', () => {
        expect(
          help(integrationResource.createThresholdSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: integrationResource.integrationResourceCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('link help output snapshots', () => {
    it('link help column width 40', () => {
      expect(
        help(linkCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('link help column width 80', () => {
      expect(
        help(linkCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('link help column width 120', () => {
      expect(
        help(linkCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
  });

  describe('list help output snapshots', () => {
    it('list help column width 40', () => {
      expect(
        help(listCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('list help column width 80', () => {
      expect(
        help(listCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('list help column width 120', () => {
      expect(
        help(listCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
  });

  describe('login help output snapshots', () => {
    it('login help column width 40', () => {
      expect(
        help(loginCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('login help column width 80', () => {
      expect(
        help(loginCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('login help column width 120', () => {
      expect(
        help(loginCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
  });

  describe('project help output snapshots', () => {
    it('project help column width 40', () => {
      expect(
        help(project.projectCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('project help column width 80', () => {
      expect(
        help(project.projectCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('project help column width 120', () => {
      expect(
        help(project.projectCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
    describe('project create help output snapshots', () => {
      it('project create help column width 120', () => {
        expect(
          help(project.addSubcommand, {
            stream: { isTTY: false },
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
            stream: { isTTY: false },
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
            stream: { isTTY: false },
            columns: 120,
            parent: project.projectCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('project delete help output snapshots', () => {
      it('project delete help column width 120', () => {
        expect(
          help(project.removeSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: project.projectCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('project rename help output snapshots', () => {
      it('project rename help column width 120', () => {
        expect(
          help(project.renameSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: project.projectCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('project pause help output snapshots', () => {
      it('project pause help column width 120', () => {
        expect(
          help(project.pauseSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: project.projectCommand,
          })
        ).toMatchSnapshot();
      });
    });
    describe('project resume help output snapshots', () => {
      it('project resume help column width 120', () => {
        expect(
          help(project.resumeSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: project.projectCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('promote help output snapshots', () => {
    it('promote help column width 40', () => {
      expect(
        help(promote.promoteCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('promote help column width 80', () => {
      expect(
        help(promote.promoteCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('promote help column width 120', () => {
      expect(
        help(promote.promoteCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
    describe('promote status help output snapshots', () => {
      it('promote status help column width 120', () => {
        expect(
          help(promote.statusSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: promote.promoteCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('pull help output snapshots', () => {
    it('pull help column width 40', () => {
      expect(
        help(pullCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('pull help column width 80', () => {
      expect(
        help(pullCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('pull help column width 120', () => {
      expect(
        help(pullCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
  });

  describe('redeploy help output snapshots', () => {
    it('redeploy help column width 40', () => {
      expect(
        help(redeployCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('redeploy help column width 80', () => {
      expect(
        help(redeployCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('redeploy help column width 120', () => {
      expect(
        help(redeployCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
  });

  describe('remove help output snapshots', () => {
    it('remove help column width 40', () => {
      expect(
        help(removeCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('remove help column width 80', () => {
      expect(
        help(removeCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('remove help column width 120', () => {
      expect(
        help(removeCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
  });

  describe('rollback help output snapshots', () => {
    it('rollback help column width 40', () => {
      expect(
        help(rollback.rollbackCommand, {
          stream: { isTTY: false },
          columns: 40,
        })
      ).toMatchSnapshot();
    });
    it('rollback help column width 80', () => {
      expect(
        help(rollback.rollbackCommand, {
          stream: { isTTY: false },
          columns: 80,
        })
      ).toMatchSnapshot();
    });
    it('rollback help column width 120', () => {
      expect(
        help(rollback.rollbackCommand, {
          stream: { isTTY: false },
          columns: 120,
        })
      ).toMatchSnapshot();
    });
    describe('rollback status help output snapshots', () => {
      it('rollback status help column width 120', () => {
        expect(
          help(rollback.statusSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: rollback.rollbackCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('target help output snapshots', () => {
    it('target help column width 40', () => {
      expect(
        help(target.targetCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('target help column width 80', () => {
      expect(
        help(target.targetCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('target help column width 120', () => {
      expect(
        help(target.targetCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
    describe('target list help output snapshots', () => {
      it('target list help column width 120', () => {
        expect(
          help(target.listSubcommand, {
            stream: { isTTY: false },
            columns: 120,
            parent: target.targetCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('teams help output snapshots', () => {
    it('teams help column width 40', () => {
      expect(
        help(teams.teamsCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('teams help column width 80', () => {
      expect(
        help(teams.teamsCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('teams help column width 120', () => {
      expect(
        help(teams.teamsCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
    describe('teams create help output snapshots', () => {
      it('teams create help column width 120', () => {
        expect(
          help(teams.addSubcommand, {
            stream: { isTTY: false },
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
            stream: { isTTY: false },
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
            stream: { isTTY: false },
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
            stream: { isTTY: false },
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
        help(telemetry.telemetryCommand, {
          stream: { isTTY: false },
          columns: 40,
        })
      ).toMatchSnapshot();
    });
    it('telemetry help column width 80', () => {
      expect(
        help(telemetry.telemetryCommand, {
          stream: { isTTY: false },
          columns: 80,
        })
      ).toMatchSnapshot();
    });
    it('telemetry help column width 120', () => {
      expect(
        help(telemetry.telemetryCommand, {
          stream: { isTTY: false },
          columns: 120,
        })
      ).toMatchSnapshot();
    });
    describe('telemetry status help output snapshots', () => {
      it('telemetry status help column width 120', () => {
        expect(
          help(telemetry.statusSubcommand, {
            stream: { isTTY: false },
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
            stream: { isTTY: false },
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
            stream: { isTTY: false },
            columns: 120,
            parent: telemetry.telemetryCommand,
          })
        ).toMatchSnapshot();
      });
    });
  });

  describe('whoami help output snapshots', () => {
    it('whoami help column width 40', () => {
      expect(
        help(whoamiCommand, { stream: { isTTY: false }, columns: 40 })
      ).toMatchSnapshot();
    });
    it('whoami help column width 80', () => {
      expect(
        help(whoamiCommand, { stream: { isTTY: false }, columns: 80 })
      ).toMatchSnapshot();
    });
    it('whoami help column width 120', () => {
      expect(
        help(whoamiCommand, { stream: { isTTY: false }, columns: 120 })
      ).toMatchSnapshot();
    });
  });
});
