import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import {
  configureHelpOutput,
  createHelpTheme,
} from '../../../../src/util/output/help-theme';
import {
  helpCommand,
  helpHeading,
  helpInlineCommand,
  helpRows,
  helpUsage,
} from '../../../../src/util/output/help-format';
import {
  buildCommandExampleLines,
  buildHelpOutput,
  help,
  type Command,
} from '../../../../src/commands/help';

beforeEach(() => {
  vi.stubEnv('TERM', 'xterm-256color');
  vi.stubEnv('NO_COLOR', '');
  vi.stubEnv('FORCE_COLOR', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  configureHelpOutput(false);
});

const rich = () => createHelpTheme({ isTTY: true }, { level: 1 });
const fixture: Command = {
  name: 'example',
  aliases: [],
  description: 'Read a useful description',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'Inspect a named project',
      value: 'vercel inspect "<PROJECT>"',
      placeholders: ['<PROJECT>'],
    },
  ],
  documentation: { label: 'Learn more', url: 'https://example.com/docs' },
};

describe('help theme', () => {
  it('separates colored section headings, neutral usage, and inline commands', () => {
    expect(helpHeading('Commands', rich())).toBe(
      '\u001b[1m\u001b[35mCommands:\u001b[39m\u001b[22m'
    );
    expect(helpUsage(rich())).toBe('\u001b[1m▲\u001b[22m');
    expect(helpInlineCommand('vercel --help')).toBe('`vercel --help`');
    const styled = help(fixture, {
      stream: { isTTY: true },
      columns: 120,
      theme: rich(),
    });
    expect(styled).toContain(
      '\u001b[1m\u001b[35mGlobal Options:\u001b[39m\u001b[22m See `vercel --help`'
    );
    expect(helpHeading('Commands', createHelpTheme({ isTTY: false }))).toBe(
      'Commands:'
    );
  });

  it('resolves a destination theme for direct help-builder calls', () => {
    expect(
      buildHelpOutput(fixture, { columns: 80, stream: { isTTY: false } })
    ).toBe(help(fixture, { columns: 80, stream: { isTTY: false } }));
  });
  it('uses the required destination capabilities for help instead of a default stream', () => {
    vi.stubEnv('FORCE_COLOR', '1');
    const terminal = help(fixture, { columns: 80, stream: { isTTY: true } });
    const redirected = help(fixture, { columns: 80, stream: { isTTY: false } });
    expect(terminal).toContain('\u001b[');
    expect(redirected).not.toContain('\u001b[');
    expect(stripAnsi(terminal)).toBe(redirected);
  });
  it('dims generic overviews but keeps essential descriptions in foreground', () => {
    const overview = help(fixture, {
      stream: { isTTY: true },
      columns: 120,
      theme: rich(),
    });
    expect(overview).toContain('\u001b[2mRead a useful description\u001b[22m');
    const essential = help(
      {
        ...fixture,
        description: 'Changes take effect immediately',
        descriptionTone: 'normal',
      },
      { stream: { isTTY: true }, columns: 120, theme: rich() }
    );
    expect(essential).toContain('\nChanges take effect immediately\n');
    expect(essential).not.toContain('\u001b[2mChanges');
    expect(createHelpTheme({ isTTY: false }).description('Overview')).toBe(
      'Overview'
    );
  });
  it.each([
    '1',
    '0',
    'false',
    'anything',
  ])('honors nonempty NO_COLOR=%s over force', value => {
    vi.stubEnv('NO_COLOR', value);
    vi.stubEnv('FORCE_COLOR', '3');
    expect(rich().command('vercel')).toBe('vercel');
    expect(rich().emphasis('▲')).toBe('▲');
    expect(rich().heading('Commands:')).toBe('Commands:');
  });
  it.each([
    '1',
    '2',
    '3',
  ])('keeps forced-color help plain off a rich terminal (%s)', force => {
    vi.stubEnv('FORCE_COLOR', force);
    expect(
      createHelpTheme({ isTTY: false }, { level: 1 }).command('vercel')
    ).toBe('vercel');
    vi.stubEnv('TERM', 'dumb');
    expect(rich().command('vercel')).toBe('vercel');
  });
  it('honors the parsed flag and FORCE_COLOR=0', () => {
    vi.stubEnv('FORCE_COLOR', '1');
    configureHelpOutput(true);
    expect(rich().command('vercel')).toBe('vercel');
    configureHelpOutput(false);
    vi.stubEnv('FORCE_COLOR', '0');
    expect(rich().command('vercel')).toBe('vercel');
  });
  it('isolates stream styles from each other and global chalk mutations', () => {
    const tty = rich();
    const pipe = createHelpTheme({ isTTY: false }, { level: 1 });
    const previous = chalk.level;
    try {
      chalk.level = 0;
      expect(tty.command('vercel')).toBe('\u001b[36mvercel\u001b[39m');
      expect(pipe.command('vercel')).toBe('vercel');
      expect(tty.reference('--cwd')).toBe('\u001b[1m--cwd\u001b[22m');
      expect(pipe.reference('--cwd')).toBe('--cwd');
      expect(tty.emphasis('▲')).toBe('\u001b[1m▲\u001b[22m');
    } finally {
      chalk.level = previous;
    }
  });
  it.each([
    40, 80, 120,
  ])('keeps template spans explicit and text lossless at %s columns', columns => {
    const colored = help(fixture, {
      stream: { isTTY: true },
      columns,
      theme: rich(),
    });
    const plain = help(fixture, {
      stream: { isTTY: false },
      columns,
      theme: createHelpTheme({ isTTY: false }),
    });
    expect(stripAnsi(colored)).toBe(plain);
    expect(stripAnsi(colored)).not.toContain('replace placeholders');
    expect(colored).toContain('    vercel inspect "<PROJECT>"\n');
    expect(colored).not.toContain('\u001b[36m');
    expect(colored).toContain('\u001b[4mhttps://example.com/docs\u001b[24m');
    expect(plain).toContain('    vercel inspect "<PROJECT>"\n');
    expect(colored).not.toMatch(/\u001b\[(?:31|32|33|3|7)m/);
  });
  it('bolds reference spellings while keeping value hints normal weight', () => {
    const rows = [
      {
        syntax: [
          { text: '--scope', literal: true as const },
          { text: ' <TEAM>' },
        ],
        description: 'Team to act in',
      },
    ];
    for (const columns of [40, 80, 120]) {
      const styled = helpRows(rows, columns, rich());
      expect(styled).toContain('\u001b[1m--scope\u001b[22m <TEAM>');
      expect(stripAnsi(styled)).toBe(
        helpRows(rows, columns, createHelpTheme({ isTTY: false }))
      );
    }
  });
  it('accents only the concrete line in a paired template example', () => {
    const examples = buildCommandExampleLines(
      {
        examples: [
          {
            name: 'Inspect a project',
            placeholders: ['<PROJECT>'],
            value: ['vercel inspect <PROJECT>', 'vercel inspect acme-web'],
          },
        ],
      },
      80,
      rich()
    );
    expect(examples).toContain('Inspect a project\n');
    expect(examples).not.toContain('replace placeholders');
    expect(examples).toContain('    vercel inspect <PROJECT>\n');
    expect(examples).toContain(
      '    \u001b[36mvercel inspect acme-web\u001b[39m'
    );
  });
  it('preserves literal angle brackets, quotes and long commands without inferring templates', () => {
    const command = `vercel example '<tag>' "two  spaces" ${'long'.repeat(60)}`;
    expect(helpCommand(command, [], rich())).toBe(
      `    \u001b[36m${command}\u001b[39m`
    );
    expect(stripAnsi(helpCommand(command, [], rich()))).toBe(`    ${command}`);
  });
  it('keeps compound placeholders neutral and ignores undeclared plain strings', () => {
    const command = 'vercel dns add <DOMAIN> <A | AAAA> <RECORD VALUE>';
    const styled = helpCommand(
      command,
      ['<DOMAIN>', '<A | AAAA>', '<RECORD VALUE>'],
      rich()
    );
    expect(styled).toBe(`    ${command}`);
    for (const marker of ['<DOMAIN>', '<A | AAAA>', '<RECORD VALUE>']) {
      expect(styled).not.toContain(`\u001b[36m${marker}`);
    }
    expect(helpCommand('vercel team acme', ['TEAM', 'acme'], rich())).toBe(
      '    \u001b[36mvercel team acme\u001b[39m'
    );
  });
  it('uses one description column and narrow layout across detailed records', () => {
    const theme = createHelpTheme({ isTTY: false });
    for (const syntax of ['a', 'long-record']) {
      const wide = helpRows(
        [{ syntax, description: 'Description' }],
        80,
        theme,
        11
      );
      expect(wide.indexOf('Description')).toBe(15);
      const narrow = helpRows(
        [{ syntax, description: 'Description' }],
        40,
        theme,
        11
      );
      expect(narrow).toContain('\n    Description');
    }
  });
  it('sanitizes command and placeholder control sequences before styling', () => {
    expect(
      stripAnsi(
        helpCommand('vercel inspect <ID>\u001b[31m', ['<ID>\u001b[31m'], rich())
      )
    ).toBe('    vercel inspect <ID>');
  });
});
