import { helpCommandNames } from '../util/output/help-format';
import type { Command } from './help';
import { BETA_COMMANDS } from '../util/beta-commands';

export interface RootHelpCommand {
  /** Canonical command name, or a separately supported shortcut. */
  readonly names: ReadonlyArray<string>;
  readonly description: string;
  readonly group: string;
  /** `vercel` with no command runs this one. */
  readonly default: boolean;
}

// Display categories do not change command paths. Unclassified commands remain
// discoverable in the final group, so new registrations can never disappear.
export const ROOT_HELP_GROUPS = {
  'Deploy and Develop': [
    'deploy',
    'build',
    'dev',
    'init',
    'inspect',
    'list',
    'promote',
    'redeploy',
    'rollback',
    'remove',
    'rolling-release',
    'bisect',
    'ci',
    'curl',
    'httpstat',
  ],
  'Projects and Configuration': [
    'project',
    'link',
    'open',
    'pull',
    'env',
    'git',
    'cache',
    'target',
    'environments',
    'flags',
    'microfrontends',
    'deploy-hooks',
  ],
  'Domains and Traffic': [
    'domains',
    'dns',
    'alias',
    'certs',
    'redirects',
    'routes',
  ],
  'Data and Compute': [
    'storage',
    'blob',
    'global-config',
    'sandbox',
    'vcr',
    'daemons',
    'crons',
    'schedules',
    'ai-gateway',
  ],
  'Operations and Security': [
    'activity',
    'health',
    'agent-runs',
    'alerts',
    'monitors',
    'comments',
    'logs',
    'drains',
    'metrics',
    'traces',
    'security',
    'firewall',
    'kms',
    'webhooks',
  ],
  'Account and Billing': [
    'login',
    'logout',
    'signup',
    'switch',
    'teams',
    'organizations',
    'tokens',
    'whoami',
    'budgets',
    'buy',
    'contract',
    'pricing',
    'usage',
  ],
  'CLI and Integrations': [
    'help',
    'feedback',
    'api',
    'install',
    'integration',
    'integration-resource',
    'connect',
    'agent',
    'mcp',
    'setup',
    'skills',
    'changelog',
    'telemetry',
    'upgrade',
    'version',
    'token-pass',
  ],
} as const;

function commandGroup(name: string, fallback = 'CLI and Integrations'): string {
  return (
    Object.entries(ROOT_HELP_GROUPS).find(([, names]) =>
      (names as readonly string[]).includes(name)
    )?.[0] ?? fallback
  );
}

// Compatibility spellings remain accepted but are not taught.
const DEPRECATED_COMMANDS: ReadonlySet<string> = new Set([
  'integration-resource',
]);

// `vercel` with no command runs `deploy`.
const DEFAULT_COMMAND = 'deploy';

const HELP_ROW = {
  names: ['help'],
  description: 'Show help for a command',
  group: commandGroup('help'),
  default: false,
} satisfies RootHelpCommand;

/** The first sentence of a command description, without its period. */
function summarize(description: string): string {
  const firstLine = description
    .trim()
    .split(/\n\s*\n/)[0]
    .replace(/\s*\n\s*/g, ' ');
  const abbreviations = new Set(['e.g.', 'i.e.', 'vs.', 'etc.']);
  const sentenceEnd = [...firstLine.matchAll(/[^.]\.(\s|$)/g)].find(match => {
    const prefix = firstLine.slice(0, match.index + 2);
    return !abbreviations.has(
      (prefix.split(/\s/).at(-1) ?? '').replace(/^[^a-z]+/i, '')
    );
  });
  const sentence = sentenceEnd
    ? firstLine.slice(0, sentenceEnd.index + 1)
    : firstLine;
  return sentence.replace(/\.$/, '');
}

/**
 * Builds the `vercel --help` command list from the registered commands, so
 * the root help page always lists every visible command.
 */
export function getRootHelpCommands(
  commands: ReadonlyArray<Pick<Command, 'name'> | Command>
): RootHelpCommand[] {
  const rows: RootHelpCommand[] = [HELP_ROW];
  for (const command of commands) {
    if (
      !('description' in command) ||
      command.hidden ||
      command.name === 'help' ||
      DEPRECATED_COMMANDS.has(command.name)
    ) {
      continue;
    }
    const names = helpCommandNames(command);
    let description = command.summary
      ? command.summary.replace(/\.$/, '')
      : summarize(command.description);
    if (BETA_COMMANDS.has(command.name)) {
      description += ' [beta]';
    }
    rows.push({
      names,
      description,
      group: commandGroup(command.name),
      default: command.name === DEFAULT_COMMAND,
    });

    // An alias that names one of the command's subcommands is a shortcut for
    // it, as `vercel switch` runs `vercel teams switch`, so it gets its own row.
    for (const alias of command.aliases) {
      const subcommand = command.subcommands?.find(
        candidate => candidate.name === alias && !candidate.hidden
      );
      if (subcommand) {
        rows.push({
          names: [alias],
          description: subcommand.summary
            ? subcommand.summary.replace(/\.$/, '')
            : summarize(subcommand.description),
          group: commandGroup(alias, commandGroup(command.name)),
          default: false,
        });
      }
    }
  }
  // The default command leads its section; the rest are alphabetical.
  return rows.sort((a, b) => {
    if (a.default !== b.default) {
      return a.default ? -1 : 1;
    }
    const aName = a.names[a.names.length - 1];
    const bName = b.names[b.names.length - 1];
    return aName < bName ? -1 : aName > bName ? 1 : 0;
  });
}
