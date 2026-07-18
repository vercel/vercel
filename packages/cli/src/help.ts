import chalk from 'chalk';
import { commandsStructs } from './commands';
import { globalCommandOptions } from './util/arg-common';
import type { Command } from './commands/help';

// Hardcoded to avoid importing pkg.ts which pulls in more dependencies
const packageName = 'vercel';
const logo = '▲';

/**
 * The command lines below are rendered from the same registration metadata
 * the CLI routes with, so this help cannot list commands that do not exist
 * or omit ones that do. Only the grouping is curated: anything registered
 * but not named here is listed under "Advanced" automatically.
 */
const BASIC_COMMANDS = [
  'deploy',
  'build',
  'cache',
  'dev',
  'env',
  'git',
  'help',
  'init',
  'inspect',
  'install',
  'integration',
  'integration-resource',
  'link',
  'list',
  'login',
  'logout',
  'open',
  'promote',
  'pull',
  'redeploy',
  'rollback',
];

const NAME_COLUMN = 21;
const ARGS_COLUMN = 12;
const MAX_DESCRIPTION = 78;

type RootCommandEntry = Pick<Command, 'name' | 'aliases'> &
  Partial<Pick<Command, 'description' | 'arguments' | 'subcommands'>> & {
    hidden?: boolean;
  };

function firstSentence(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^.*?[.!?](?=\s)/);
  return match ? match[0] : normalized;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max)}…`;
}

function displayName(command: RootCommandEntry): string {
  // Shortest first, matching the established `ls | list` convention.
  return [command.name, ...command.aliases]
    .slice()
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .join(' | ');
}

function argsHint(command: RootCommandEntry): string {
  if (command.name === 'help') return '[cmd]';
  const first = command.arguments?.[0];
  if (first) {
    return first.required ? `<${first.name}>` : `[${first.name}]`;
  }
  return command.subcommands?.length ? '[cmd]' : '';
}

function description(command: RootCommandEntry): string {
  if (command.name === 'help') {
    return 'Display help for a command';
  }
  const text = truncate(
    firstSentence(command.description ?? '').replace(/\.$/, ''),
    MAX_DESCRIPTION
  );
  if (command.name === 'deploy') {
    return `${text} ${chalk.bold('(default)')}`;
  }
  return text;
}

function pad(text: string, width: number): string {
  return text.length >= width ? `${text} ` : text.padEnd(width);
}

function commandLine(command: RootCommandEntry): string {
  return `      ${pad(displayName(command), NAME_COLUMN)}${pad(
    argsHint(command),
    ARGS_COLUMN
  )}${description(command)}`;
}

function commandLines(): { basic: string[]; advanced: string[] } {
  const visible = (commandsStructs as readonly RootCommandEntry[]).filter(
    command => !command.hidden
  );
  const byName = new Map(visible.map(command => [command.name, command]));

  const basic: string[] = [];
  for (const name of BASIC_COMMANDS) {
    const command = byName.get(name);
    if (command) {
      basic.push(commandLine(command));
      byName.delete(name);
    }
  }

  const advanced = [...byName.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(commandLine);

  return { basic, advanced };
}

function globalOptionLines(): string[] {
  const lines: string[] = [];
  for (const option of globalCommandOptions) {
    // Undocumented options (no description) are omitted, matching help
    // output for command options.
    if (
      option.deprecated ||
      !('description' in option) ||
      !option.description
    ) {
      continue;
    }
    const argument =
      'argument' in option && option.argument
        ? `=${chalk.bold.underline(option.argument)}`
        : '';
    const flags = [
      option.shorthand ? `-${option.shorthand}` : null,
      `--${option.name}${argument}`,
    ]
      .filter(Boolean)
      .join(', ');
    lines.push(`    ${pad(flags, 31)}${option.description}`);
  }
  return lines;
}

export const help = () => {
  const { basic, advanced } = commandLines();
  return `
  ${chalk.bold(`${logo} ${packageName}`)} [options] <command | path>

  ${chalk.dim('For deploy command help, run `vercel deploy --help`')}

  ${chalk.dim('Commands:')}

    ${chalk.dim('Basic')}

${basic.join('\n')}

    ${chalk.dim('Advanced')}

${advanced.join('\n')}

  ${chalk.dim('Global Options:')}

${globalOptionLines().join('\n')}

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Deploy the current directory

    ${chalk.cyan(`$ ${packageName}`)}

  ${chalk.gray('–')} Deploy a custom path

    ${chalk.cyan(`$ ${packageName} /usr/src/project`)}

  ${chalk.gray('–')} Deploy with Environment Variables

    ${chalk.cyan(`$ ${packageName} -e NODE_ENV=production`)}

  ${chalk.gray('–')} Show the usage information for the sub command ${chalk.dim(
    '`list`'
  )}

    ${chalk.cyan(`$ ${packageName} help list`)}
`;
};
