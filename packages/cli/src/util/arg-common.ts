import { getFlagsSpecification } from './get-flags-specification';

export const globalCommandOptions = [
  {
    name: 'help',
    shorthand: 'h',
    type: Boolean,
    description: 'Output usage information',
    deprecated: false,
  },
  {
    name: 'version',
    shorthand: 'v',
    type: Boolean,
    description: 'Output the version number',
    deprecated: false,
  },
  {
    name: 'cwd',
    shorthand: null,
    type: String,
    argument: 'DIR',
    description:
      'Sets the current working directory for a single run of a command',
    deprecated: false,
  },
  {
    name: 'local-config',
    shorthand: 'A',
    type: String,
    argument: 'FILE',
    description: 'Path to the local `vercel.json` file',
    deprecated: false,
  },
  {
    name: 'global-config',
    shorthand: 'Q',
    type: String,
    argument: 'DIR',
    description: 'Path to the global `.vercel` directory',
    deprecated: false,
  },
  {
    name: 'debug',
    shorthand: 'd',
    type: Boolean,
    description: 'Debug mode (default off)',
    deprecated: false,
  },
  {
    name: 'no-color',
    shorthand: null,
    type: Boolean,
    description: 'No color mode (default off)',
    deprecated: false,
  },
  {
    name: 'non-interactive',
    shorthand: null,
    type: Boolean,
    description:
      'Run without interactive prompts; when an agent is detected this is the default',
    deprecated: false,
  },
  {
    name: 'scope',
    shorthand: 'S',
    type: String,
    description: 'Set a custom scope',
    deprecated: false,
  },
  {
    name: 'token',
    shorthand: 't',
    type: String,
    argument: 'TOKEN',
    description: 'Login token',
    deprecated: false,
  },
  { name: 'team', shorthand: 'T', type: String, deprecated: false },
  { name: 'api', shorthand: null, type: String, deprecated: false },
  // Hidden flag: used by agents to confirm mutating operations after user approval
  {
    name: 'with-agent-confirmation',
    shorthand: null,
    type: Boolean,
    deprecated: false,
  },
] as const;

/**
 * Long and short names for global CLI flags (from globalCommandOptions).
 * Use when building suggested `next` commands so only context flags are forwarded.
 */
export const GLOBAL_CLI_FLAG_NAMES: ReadonlySet<string> = (() => {
  const set = new Set<string>();
  for (const opt of globalCommandOptions) {
    set.add(`--${opt.name}`);
    if (opt.shorthand) {
      set.add(`-${opt.shorthand}`);
    }
  }
  return set;
})();

/**
 * Whether a global CLI flag expects a separate argv token (String type).
 */
export function globalCliFlagTakesValue(flagName: string): boolean {
  const normalized = flagName.includes('=')
    ? flagName.slice(0, flagName.indexOf('='))
    : flagName;
  for (const opt of globalCommandOptions) {
    if (`--${opt.name}` === normalized) {
      return opt.type === String;
    }
    if (opt.shorthand && `-${opt.shorthand}` === normalized) {
      return opt.type === String;
    }
  }
  return false;
}

/**
 * Returns only global flags from argv tail. Safe to append to suggested
 * commands for any subcommand so agents do not hit parse errors from
 * subcommand-specific flags.
 */
export function getGlobalFlagsOnlyFromArgs(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('-')) continue;
    let name = a;
    const hasEq = a.includes('=');
    if (hasEq) {
      name = a.slice(0, a.indexOf('='));
    }
    if (!GLOBAL_CLI_FLAG_NAMES.has(name)) {
      continue;
    }
    out.push(a);
    if (!hasEq && globalCliFlagTakesValue(name)) {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        out.push(args[++i]);
      }
    }
  }
  return out;
}

/**
 * Subcommand option names that take a separate argv token (not boolean).
 * Used when the suggested `next` command is the SAME subcommand so we
 * preserve e.g. --slug acme, --status 301 alongside globals.
 */
const SUBCOMMAND_FLAG_TAKES_VALUE = new Set([
  '--status',
  '--name',
  '--slug',
  '--version', // redirects list --version
  '--search',
  '--format',
  '--page',
  '--per-page',
]);

function suggestionFlagTakesSeparateValue(flagName: string): boolean {
  const name = flagName.includes('=')
    ? flagName.slice(0, flagName.indexOf('='))
    : flagName;
  if (globalCliFlagTakesValue(name)) return true;
  return SUBCOMMAND_FLAG_TAKES_VALUE.has(name);
}

/**
 * Builds a flag suffix for suggested commands that repeat the SAME subcommand
 * as the user's invocation. Preserves subcommand-specific flags and their
 * values; skips bare positionals. Use this instead of getGlobalFlagsOnlyFromArgs
 * when next[] points at the same command (e.g. teams add with missing --name).
 *
 * When next[] points at a different subcommand (e.g. promote, list), use
 * getGlobalFlagsOnlyFromArgs so flags that don't apply are not forwarded.
 */
export function getSameSubcommandSuggestionFlags(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('-')) continue;
    out.push(a);
    if (a.includes('=')) continue;
    const name = a;
    if (
      suggestionFlagTakesSeparateValue(name) &&
      i + 1 < args.length &&
      !args[i + 1].startsWith('-')
    ) {
      out.push(args[++i]);
    }
  }
  return out;
}

const GLOBAL_OPTIONS = getFlagsSpecification(globalCommandOptions);

export default () => GLOBAL_OPTIONS;

export const yesOption = {
  name: 'yes',
  shorthand: 'y',
  type: Boolean,
  deprecated: false,
  description: 'Accept default value for all prompts',
} as const;

export const nextOption = {
  name: 'next',
  shorthand: 'N',
  type: Number,
  deprecated: false,
  description: 'Show next page of results',
  argument: 'MS',
} as const;

export const confirmOption = {
  name: 'confirm',
  shorthand: 'c',
  type: Boolean,
  deprecated: true,
} as const;

export const limitOption = {
  name: 'limit',
  shorthand: null,
  type: Number,
  deprecated: false,
  description: 'Number of results to return per page (default: 20, max: 100)',
  argument: 'NUMBER',
} as const;

export const forceOption = {
  name: 'force',
  shorthand: 'f',
  type: Boolean,
  deprecated: false,
} as const;

export const formatOption = {
  name: 'format',
  shorthand: 'F',
  type: String,
  argument: 'FORMAT',
  description: 'Specify the output format (json)',
  deprecated: false,
} as const;

export const jsonOption = {
  name: 'json',
  shorthand: null,
  type: Boolean,
  deprecated: true,
  description: 'DEPRECATED: Use --format=json instead',
} as const;

export const nonInteractiveOption = {
  name: 'non-interactive',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description:
    'Run without interactive prompts; when an agent is detected this is the default',
} as const;

export const allOption = {
  name: 'all',
  shorthand: 'a',
  type: Boolean,
  deprecated: false,
  description: 'List resources across all projects',
} as const;
