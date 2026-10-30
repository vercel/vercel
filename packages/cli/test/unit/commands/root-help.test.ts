import { describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import { help } from '../../../src/help';
import { commandsStructs } from '../../../src/commands';
import {
  getRootHelpCommands,
  ROOT_HELP_GROUPS,
} from '../../../src/commands/root-help';
import { BETA_COMMANDS } from '../../../src/util/beta-commands';

const rows = getRootHelpCommands(commandsStructs);
const rendered = stripAnsi(help(rows, 120));

function rowFor(name: string) {
  return rows.find(row => row.names[row.names.length - 1] === name);
}

// Still runs, but `vercel integration resource` is the name taught.
const DEPRECATED_COMMANDS = ['integration-resource'];

describe('root help output', () => {
  it('curates every registered command and shortcut into one task group', () => {
    const classified = Object.values(ROOT_HELP_GROUPS).flat();
    expect(new Set(classified).size).toBe(classified.length);
    for (const row of rows) expect(classified).toContain(row.names.at(-1));
  });

  it('lists every visible top-level command', () => {
    const visible = commandsStructs.filter(
      command =>
        'description' in command &&
        !('hidden' in command && command.hidden) &&
        !DEPRECATED_COMMANDS.includes(command.name)
    );
    expect(visible.length).toBeGreaterThan(50);
    for (const command of visible) {
      expect(rowFor(command.name), command.name).toBeDefined();
      expect(rendered).toMatch(new RegExp(`^ {2}${command.name}\\s`, 'm'));
    }
  });

  it('does not list deprecated commands', () => {
    for (const name of DEPRECATED_COMMANDS) {
      expect(rowFor(name), name).toBeUndefined();
      expect(rendered).not.toMatch(new RegExp(`^ {2}${name}\\s`, 'm'));
    }
  });

  it('does not list hidden commands', () => {
    const hidden = commandsStructs.filter(
      command => 'hidden' in command && command.hidden
    );
    for (const command of hidden) {
      expect(rowFor(command.name), command.name).toBeUndefined();
    }
  });

  it('uses the first sentence of each command description', () => {
    expect(rowFor('agent-runs')?.description).toBe(
      'Inspect Agent Runs observability data'
    );
    expect(rowFor('certs')?.description).toBe('Interact with SSL certificates');
  });

  it('marks beta commands', () => {
    for (const row of rows) {
      const name = row.names[row.names.length - 1];
      expect(row.description.endsWith(' [beta]'), name).toBe(
        BETA_COMMANDS.has(name)
      );
    }
  });

  it('lists deploy first as the default command', () => {
    expect(rows[0].names).toEqual(['deploy']);
    expect(rendered).toMatch(
      /^ {2}deploy\s+Deploy your project to Vercel \(default\)$/m
    );
  });

  // Aliases are accepted, never taught.
  it('lists each command by its name alone', () => {
    expect(rowFor('list')?.names).toEqual(['list']);
    expect(rendered).toMatch(/^ {2}list\s+List deployments$/m);
    for (const row of rows) {
      expect(row.names, row.names.join(' | ')).toHaveLength(1);
    }
    const commandRows = rendered
      .slice(
        rendered.indexOf('Deploy and Develop:'),
        rendered.indexOf('Global Options:')
      )
      .split('\n')
      .filter(line => /^ {2}\S/.test(line));
    expect(commandRows.length).toBeGreaterThan(50);
    expect(commandRows.filter(line => line.includes(' | '))).toEqual([]);
  });

  it('lists the pricing command', () => {
    expect(rowFor('pricing')).toBeDefined();
    expect(rendered).toMatch(/^ {2}pricing\s+Compare /m);
  });

  // 66 columns forces the deploy row and its `(default)` label to wrap.
  it.each([66, 72, 80])('wraps descriptions to %i columns', columns => {
    const narrow = stripAnsi(help(rows, columns));
    const commandList = narrow.slice(
      narrow.indexOf('Deploy and Develop:'),
      narrow.indexOf('Global Options:')
    );
    const tooLong = commandList
      .split('\n')
      .filter(line => line.length > columns);
    expect(tooLong).toEqual([]);
    expect(commandList).toContain('(default)');
  });

  it('lists aliases that run a subcommand as their own row', () => {
    expect(rowFor('switch')).toEqual({
      names: ['switch'],
      description: 'Switch to a different team',
      group: 'Account and Billing',
      default: false,
    });
    expect(rendered).toMatch(/^ {2}switch\s+Switch to a different team$/m);
  });

  it('lists global value hints and three copyable examples', () => {
    expect(rendered).toMatch(
      /--changelog\s+Show the 5 latest Vercel product updates/
    );
    expect(rendered).toContain('-S, --scope <TEAM>');
    const examples = rendered.slice(rendered.indexOf('Examples:'));
    expect(examples.match(/^ {4}vercel(?: |$)/gm)).toHaveLength(3);
    expect(examples).toContain('    vercel deploy --yes --non-interactive');
    expect(examples).not.toMatch(/^\s*\$ /m);
  });
});
