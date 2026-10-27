import { afterEach, describe, expect, it, vi } from 'vitest';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import stringWidth from 'string-width';
import {
  help,
  resolveHelpTarget,
  type Command,
} from '../../../src/commands/help';
import { commandsStructs } from '../../../src/commands';
import { projectCommand } from '../../../src/commands/project/command';
import { domainsCommand } from '../../../src/commands/domains/command';
import { addSubcommand as domainsAddSubcommand } from '../../../src/commands/domains/command';
import {
  dnsCommand,
  addSubcommand as dnsAddSubcommand,
} from '../../../src/commands/dns/command';
import { createSubcommand as drainsCreateSubcommand } from '../../../src/commands/drains/command';
import { teamsAddSubcommand } from '../../../src/commands/organizations/command';
import { accessSummarySubcommand } from '../../../src/commands/project/command';
import { rerunSubcommand } from '../../../src/commands/ci/command';
import {
  addGrantSubcommand,
  removeGrantSubcommand,
} from '../../../src/commands/kms/command';
import { getRootHelpCommands } from '../../../src/commands/root-help';
import { help as rootHelp } from '../../../src/help';
import { helpRows, wrapHelpText } from '../../../src/util/output/help-format';
import { createHelpTheme } from '../../../src/util/output/help-theme';

const originalLevel = chalk.level;
afterEach(() => {
  chalk.level = originalLevel;
  vi.unstubAllEnvs();
});

const fixture: Command = {
  name: 'example',
  aliases: [],
  description: 'Show a useful summary',
  arguments: [],
  options: [
    {
      name: 'framework',
      shorthand: 'f',
      type: String,
      argument: 'SLUG',
      deprecated: false,
      description:
        'Choose the framework used to build this project without truncating its description',
    },
  ],
  examples: [
    {
      name: 'Build a project with a named framework',
      value: 'vercel example --framework nextjs',
    },
  ],
};

describe('help layout', () => {
  it.each([
    40, 80, 120,
  ])('keeps DNS record types discoverable at %i columns', columns => {
    for (const command of [dnsCommand, dnsAddSubcommand]) {
      const text = help(command, { columns, stream: { isTTY: false } });
      expect(text).toContain('Record Types:');
      expect(text.replace(/\s+/g, ' ')).toContain(
        'A, AAAA, ALIAS, CAA, CNAME, MX, SRV, TXT'
      );
    }
  });

  it.each([
    40, 80, 120,
  ])('preserves the two domain assignment modes at %i columns', columns => {
    const text = help(domainsAddSubcommand, {
      parent: domainsCommand,
      columns,
      stream: { isTTY: false },
    }).replace(/\s+/g, ' ');
    expect(text).toContain('Without a project, adds an apex domain');
    expect(text).toContain(
      "configure the domain's nameservers at your registrar"
    );
    expect(text).toContain('With a project, assigns the domain to it');
    expect(text).toContain('External DNS providers are supported');
    expect(text).toContain('`vercel alias` can add an existing domain');
    expect(text).not.toContain('automatically register');
  });

  it('groups drains with operations and keeps credential templates neutral', () => {
    vi.stubEnv('NO_COLOR', '');
    vi.stubEnv('TERM', 'xterm');
    vi.stubEnv('FORCE_COLOR', '1');
    const drain = getRootHelpCommands(commandsStructs).find(command =>
      command.names.includes('drains')
    );
    expect(drain?.group).toBe('Operations and Security');
    const text = help(drainsCreateSubcommand, {
      columns: 80,
      stream: { isTTY: true },
      theme: createHelpTheme({ isTTY: true }, { level: 1, noColor: false }),
    });
    const credentialLine = text
      .split('\n')
      .find(line => line.includes('<TOKEN>'));
    expect(text).toContain('\u001b[');
    expect(credentialLine).toBeDefined();
    expect(credentialLine).not.toContain('\u001b[');
    expect(credentialLine).toContain(
      '--header "Authorization: Bearer <TOKEN>"'
    );
  });

  it.each([
    teamsAddSubcommand,
    accessSummarySubcommand,
    rerunSubcommand,
    addGrantSubcommand,
    removeGrantSubcommand,
  ])('keeps consequences and prerequisites visible for $name', command => {
    vi.stubEnv('TERM', 'xterm');
    vi.stubEnv('NO_COLOR', '');
    vi.stubEnv('FORCE_COLOR', '1');
    const theme = createHelpTheme(
      { isTTY: true },
      { level: 1, noColor: false }
    );
    const text = help(command, {
      stream: { isTTY: true },
      columns: 120,
      theme,
    });
    expect(text).toContain('\u001b[');
    expect(text.split('\n\n')[0]).not.toContain('\u001b[2m');
  });

  it('shows one complete template per domains job without repeated substitutions', () => {
    const text = stripAnsi(
      help(domainsCommand, { stream: { isTTY: false }, columns: 120 })
    );
    expect(text).toContain('▲ vercel domains [command]');
    const examples = text.slice(text.indexOf('Examples:'));
    expect(examples).toContain('    vercel domains renew <DOMAIN>');
    expect(examples).toContain('    vercel domains auto-renew enable <DOMAIN>');
    expect(examples).not.toContain('example.com');
    expect(examples).not.toContain('enable|disable');
    expect(examples.match(/^ {4}vercel /gm)).toHaveLength(2);
  });
  it('keeps project group examples compact and concrete', () => {
    expect(projectCommand.examples).toHaveLength(3);
    const text = stripAnsi(
      help(projectCommand, { stream: { isTTY: false }, columns: 120 })
    );
    const examples = text.slice(text.indexOf('Examples:'));
    expect(examples).toContain('vercel project list');
    expect(examples).toContain('vercel project inspect my-project');
    expect(examples).toContain('vercel project pause my-project');
    expect(examples).not.toMatch(
      /\[NAME\]|enable\|disable|replace placeholders/
    );
    expect(text).not.toContain('GET/POST/DELETE');
  });
  it.each([
    40, 80, 120,
  ])('lists canonical domain actions while preserving aliases at %i columns', columns => {
    const text = stripAnsi(
      help(domainsCommand, { stream: { isTTY: false }, columns })
    );
    expect(text).toMatch(/^ {2}list(?:\s|$)/m);
    expect(text).toMatch(/^ {2}remove <domain>/m);
    expect(text).not.toMatch(/^ {2}(?:ls|rm)(?:\s|$)/m);
    expect(text).not.toContain(' | list');
    expect(text).not.toContain(' | remove');
    expect(resolveHelpTarget(domainsCommand, ['ls']).command.name).toBe('list');
    expect(resolveHelpTarget(domainsCommand, ['rm']).command.name).toBe(
      'remove'
    );
  });
  const registered: Command[] = [];
  const collect = (command: Command) => {
    registered.push(command);
    command.subcommands?.forEach(collect);
  };
  for (const root of commandsStructs)
    if ('options' in root) collect(root as Command);
  it.each(
    registered
  )('emits the exact example commands for $name without a shell prompt', command => {
    vi.stubEnv('TERM', 'xterm-256color');
    vi.stubEnv('NO_COLOR', '');
    vi.stubEnv('FORCE_COLOR', '');
    for (const columns of [40, 80, 120]) {
      const styled = help(command, {
        stream: { isTTY: true },
        columns,
        theme: createHelpTheme({ isTTY: true }, { level: 1 }),
      });
      const unstyled = help(command, {
        stream: { isTTY: false },
        columns,
        theme: createHelpTheme({ isTTY: false }),
      });
      expect(stripAnsi(styled)).toBe(unstyled);
      if (command.descriptionTone === 'normal') {
        expect(styled.split('\n\n')[0]).not.toContain('\u001b[2m');
      }
    }
    const text = stripAnsi(
      help(command, { stream: { isTTY: false }, columns: 40 })
    );
    expect(text).not.toMatch(/<<[^>\n]+>>/);
    const examples = text;
    expect(examples).not.toMatch(/^\s*\$ /m);
    expect(examples).not.toContain('replace placeholders');
    for (const example of command.examples) {
      if (example.placeholders?.length) {
        expect(
          typeof example.value,
          'Keep each template job under its own label'
        ).toBe('string');
      }
      const values = Array.isArray(example.value)
        ? example.value
        : [example.value];
      for (const marker of example.placeholders ?? []) {
        expect(marker).toMatch(/^<[^<>\r\n]+>$/);
        expect(values.some(value => value.includes(marker))).toBe(true);
      }
      for (const value of Array.isArray(example.value)
        ? example.value
        : [example.value]) {
        expect(value).not.toMatch(/[\r\n]/);
        expect(examples.split('\n')).toContain(`    ${value}`);
        for (const marker of value.match(/<[A-Za-z][A-Za-z0-9_ |.-]*>/g) ??
          []) {
          expect(
            example.placeholders ?? [],
            `Unmarked template in ${command.name}: ${value}`
          ).toContain(marker);
        }
      }
    }
  });

  it('describes optional and argument-first groups accurately', () => {
    const child = { ...fixture, name: 'list', aliases: ['ls'] };
    const group = { ...fixture, name: 'group', subcommands: [child] };
    expect(
      stripAnsi(
        help(
          { ...group, runsWithoutSubcommand: true },
          { stream: { isTTY: false } }
        )
      )
    ).toContain('▲ vercel group [command] [options]');
    expect(
      stripAnsi(
        help(
          {
            ...group,
            argumentsBeforeSubcommand: true,
            arguments: [{ name: 'repository', required: true }],
          },
          { stream: { isTTY: false } }
        )
      )
    ).toContain('▲ vercel group <repository> <command> [options]');
    expect(stripAnsi(help(group, { stream: { isTTY: false } }))).toContain(
      '  list'
    );
    expect(stripAnsi(help(group, { stream: { isTTY: false } }))).not.toContain(
      'ls | list'
    );
    expect(resolveHelpTarget(group, ['ls']).command).toBe(child);
    expect(
      stripAnsi(
        help(
          { ...group, subcommands: [{ ...child, hidden: true }] },
          { stream: { isTTY: false } }
        )
      )
    ).not.toContain('<command>');
  });

  it('preserves commands and explicit code blocks in custom sections', () => {
    const command =
      'vercel env pull .env.local --environment=preview --project=my-long-project-name';
    const code =
      'curl --header "X-Example: two  spaces" https://example.com/very-long-path';
    const text = stripAnsi(
      help(
        {
          ...fixture,
          helpSections: [
            { title: 'Next', body: [{ command }] },
            {
              title: 'Request',
              preformatted: true,
              body: [code, '  vercel is literal code here'],
            },
            {
              title: 'Prose',
              body: ['vercel describes this interface in prose'],
            },
            { title: 'Empty', body: [] },
          ],
        },
        { stream: { isTTY: false }, columns: 40 }
      )
    );
    expect(text).toContain(`Next:\n    ${command}\n`);
    expect(text).toContain(
      `Request:\n  ${code}\n    vercel is literal code here\n`
    );
    expect(text).toContain(
      'Prose:\n  vercel describes this interface in\n  prose'
    );
    expect(text).not.toContain('Empty:');
    expect(text).not.toMatch(/\n{3}/);
  });

  it('keeps header spacing stable for empty and multiline summaries', () => {
    for (const description of ['', 'A summary\n']) {
      const text = help(
        { ...fixture, description },
        { stream: { isTTY: false } }
      );
      expect(text).not.toMatch(/\n{3}/);
    }
  });

  it('keeps all text after leading blank description lines', () => {
    expect(
      helpRows([{ syntax: 'list', description: '\nComplete description' }], 80)
    ).toBe('  list  Complete description');
    const text = wrapHelpText('Keep 5\u00a0GB together while wrapping', 14);
    expect(text).toContain('5\u00a0GB');
  });

  it('preserves authored summaries and excludes child shortcuts from parent aliases', () => {
    const child = {
      ...fixture,
      name: 'ls',
      summary: 'A complete summary. With two sentences.',
    };
    const rows = getRootHelpCommands([
      {
        ...fixture,
        name: 'parent',
        aliases: ['ls'],
        subcommands: [child],
        description: 'Describe e.g. a useful feature. More details.',
      },
    ]);
    expect(rows.find(row => row.names.includes('parent'))?.names).toEqual([
      'parent',
    ]);
    expect(rows.find(row => row.names.includes('parent'))?.description).toBe(
      'Describe e.g. a useful feature'
    );
    expect(rows.find(row => row.names.includes('ls'))?.description).toBe(
      'A complete summary. With two sentences'
    );
  });

  it.each([
    40, 80, 120,
  ])('keeps complete syntax and readable descriptions at %i columns', columns => {
    const text = stripAnsi(
      help(fixture, { stream: { isTTY: false }, columns })
    );
    expect(
      text.startsWith(
        '▲ vercel example [options]\nShow a useful summary\n\nOptions:\n'
      )
    ).toBe(true);
    expect(text).toContain('-f, --framework <SLUG>');
    expect(text.replace(/\s+/g, ' ')).toContain(fixture.options[0].description);
    expect(text).not.toContain('…');
    expect(text.split('\n').every(line => stringWidth(line) <= columns)).toBe(
      true
    );
    expect(text).toContain('Global Options: See `vercel --help`');
    expect(text).not.toContain('--token');
    expect(text).toContain(
      'Examples:\n  Build a project with a named framework\n    vercel example --framework nextjs'
    );
    expect(text).not.toMatch(/\n{3}/);
  });

  it('stacks the whole section when there is no useful description column', () => {
    const rows = [
      {
        syntax: '--framework <SLUG>',
        description: 'Select the framework for this project',
      },
      { syntax: '--yes', description: 'Use the configured default' },
    ];
    const text = helpRows(rows, 40);
    expect(text).toContain('  --framework <SLUG>\n    Select the framework');
    expect(text).toContain('  --yes\n    Use the configured default');
    expect(helpRows(rows, 80)).toContain(
      '  --framework <SLUG>  Select the framework'
    );
  });

  it('preserves long copyable values and example argv verbatim', () => {
    const url = `https://example.com/${'long-path-'.repeat(12)}`;
    expect(wrapHelpText(url, 40)).toBe(`  ${url}`);
    const value = `vercel example --framework "${'a'.repeat(100)}"`;
    expect(
      stripAnsi(
        help(
          { ...fixture, examples: [{ name: 'Long invocation', value }] },
          { stream: { isTTY: false }, columns: 40 }
        )
      )
    ).toContain(`    ${value}\n`);
  });

  it('measures Unicode columns and keeps combining marks intact', () => {
    const text = wrapHelpText('東京 東京 東京 cafe\u0301 🙂 東京', 14);
    expect(text.split('\n').every(line => stringWidth(line) <= 14)).toBe(true);
    expect(text.replace(/\s+/g, ' ').trim()).toBe(
      '東京 東京 東京 cafe\u0301 🙂 東京'
    );
  });

  it('preserves indentation in structured help sections', () => {
    const text = stripAnsi(
      help(
        {
          ...fixture,
          helpSections: [
            {
              title: 'Body',
              preformatted: true,
              body: ['{', '  "name": "example"', '}'],
            },
          ],
        },
        { stream: { isTTY: false }, columns: 40 }
      )
    );
    expect(text).toContain('Body:\n  {\n    "name": "example"\n  }');
  });

  it('distinguishes bold references from accented concrete commands without changing text', () => {
    vi.stubEnv('TERM', 'xterm-256color');
    vi.stubEnv('NO_COLOR', '');
    vi.stubEnv('FORCE_COLOR', '');
    const theme = createHelpTheme({ isTTY: true }, { level: 1 });
    const text = help(fixture, { stream: { isTTY: true }, columns: 80, theme });
    expect(text).toContain('\u001b[1m▲\u001b[22m \u001b[1mvercel\u001b[22m');
    expect(text).toContain('\u001b[1m\u001b[35mOptions:\u001b[39m\u001b[22m\n');
    expect(text).toContain(
      '\u001b[1m-f\u001b[22m, \u001b[1m--framework\u001b[22m <SLUG>'
    );
    expect(text).toContain(
      '    \u001b[36mvercel example --framework nextjs\u001b[39m'
    );
    const reference = text.slice(0, text.indexOf('Examples:'));
    expect(reference).not.toContain('\u001b[36m');
    expect(reference.slice(reference.indexOf('Options:'))).not.toContain(
      '\u001b[2m'
    );
    expect(text).not.toMatch(/^\s*\$ /m);
    expect(
      help(fixture, {
        stream: { isTTY: true },
        columns: 80,
        theme: createHelpTheme({ isTTY: true }, { level: 0 }),
      })
    ).toBe(stripAnsi(text));
  });

  it('shows a new root command once even before its category is curated', () => {
    const rows = getRootHelpCommands([{ ...fixture, name: 'new-command' }]);
    expect(rows.find(row => row.names.includes('new-command'))?.group).toBe(
      'CLI and Integrations'
    );
    expect(rootHelp(rows).match(/^ {2}new-command\s/gm)).toHaveLength(1);
  });

  it.each([
    40, 80, 120,
  ])('lists every root command exactly once at %i columns', columns => {
    const rows = getRootHelpCommands(commandsStructs);
    const text = stripAnsi(rootHelp(rows, columns));
    expect(
      text.startsWith(
        '▲ vercel [options] [command | path]\n\nDeploy and Develop:\n'
      )
    ).toBe(true);
    expect(text).not.toContain('For deploy command help');
    expect(
      text
        .split('Examples:')[0]
        .split('\n')
        .every(line => stringWidth(line) <= columns)
    ).toBe(true);
    expect(text).not.toMatch(/\n{3}/);
    for (const row of rows) {
      const syntax = row.names.join(' | ');
      expect(
        text
          .split('\n')
          .filter(
            line => line === `  ${syntax}` || line.startsWith(`  ${syntax}  `)
          ),
        syntax
      ).toHaveLength(1);
    }
  });
});
