import {
  getFlagsSpecification,
  getShortFlagLongName,
  getShortFlags,
} from './get-flags-specification';
import { normalizeFlagName, stripSensitiveAuthArgs } from './redact-args';

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
    description: 'Run the command in another directory',
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
    description: 'Debug mode (default: off)',
    deprecated: false,
  },
  {
    name: 'no-color',
    shorthand: null,
    type: Boolean,
    description: 'No color mode (default: off)',
    deprecated: false,
  },
  {
    name: 'non-interactive',
    shorthand: null,
    type: Boolean,
    description:
      'Run without interactive prompts (default: on when an agent is detected)',
    deprecated: false,
  },
  {
    name: 'scope',
    shorthand: 'S',
    type: String,
    argument: 'TEAM',
    description: 'Team to run the command in (slug or ID)',
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
] as const;

/**
 * Long and short names for global CLI flags (from globalCommandOptions).
 * Use when building suggested `next` commands so only context flags are forwarded.
 */
export const GLOBAL_CLI_FLAG_NAMES: ReadonlySet<string> = (() => {
  const set = new Set<string>();
  for (const opt of globalCommandOptions) {
    set.add(`--${opt.name}`);
    for (const flag of getShortFlags(opt)) {
      set.add(flag);
    }
  }
  return set;
})();

/**
 * Whether a global CLI flag expects a separate argv token (String type).
 */
export function globalCliFlagTakesValue(flagName: string): boolean {
  const normalized = normalizeFlagName(flagName);
  for (const opt of globalCommandOptions) {
    if (`--${opt.name}` === normalized) {
      return opt.type === String;
    }
    if (getShortFlags(opt).includes(normalized)) {
      return opt.type === String;
    }
  }
  return false;
}

/**
 * Subcommand option names that take a separate argv token (not boolean).
 * Used when the suggested `next` command is the SAME subcommand so we
 * preserve e.g. --slug acme, --status 301 alongside globals.
 */
const SUGGESTION_FLAGS_TAKING_VALUE = new Set([
  '--config',
  '--deployment',
  '--environment',
  '--git-branch',
  '--id',
  '--value',
  '--status',
  '--name',
  '--slug',
  '--version', // redirects list --version
  '--search',
  '--format',
  '--project',
  '--page',
  '--per-page',
]);

export function suggestionFlagTakesSeparateValue(flagName: string): boolean {
  const name = normalizeFlagName(flagName);
  if (globalCliFlagTakesValue(name)) return true;
  return SUGGESTION_FLAGS_TAKING_VALUE.has(getShortFlagLongName(name) ?? name);
}

/**
 * Builds a flag suffix for suggested commands that repeat the SAME subcommand
 * as the user's invocation. Preserves subcommand-specific flags and their
 * values; skips bare positionals. Use this instead of getGlobalFlagsFromArgs
 * when next[] points at the same command (e.g. teams create with missing --name).
 *
 * When next[] points at a different subcommand (e.g. promote, list), use
 * getGlobalFlagsFromArgs so flags that don't apply are not forwarded.
 */
export function getSameSubcommandSuggestionFlags(args: string[]): string[] {
  const safeArgs = stripSensitiveAuthArgs(args);
  const out: string[] = [];
  for (let i = 0; i < safeArgs.length; i++) {
    const a = safeArgs[i];
    if (!a.startsWith('-')) continue;
    out.push(a);
    if (a.includes('=')) continue;
    const name = a;
    if (
      suggestionFlagTakesSeparateValue(name) &&
      i + 1 < safeArgs.length &&
      !safeArgs[i + 1].startsWith('-')
    ) {
      out.push(safeArgs[++i]);
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

/**
 * `--next` for every list. The value is an opaque cursor printed with the
 * previous page, even when a command turns it back into a timestamp or a page
 * number for the API. The old `-N` short form still parses but isn't shown
 * (see `getFlagsSpecification`).
 */
export const nextCursorOption = {
  name: 'next',
  shorthand: null,
  type: String,
  deprecated: false,
  description: 'Show the next page using the cursor from the previous output',
  argument: 'CURSOR',
} as const;

export const confirmOption = {
  name: 'confirm',
  shorthand: 'c',
  type: Boolean,
  deprecated: true,
} as const;

export const limitOption = {
  name: 'limit',
  shorthand: 'n',
  type: Number,
  deprecated: false,
  description: 'Number of results to return per page (default: 20, max: 100)',
  argument: 'NUMBER',
} as const;

/**
 * `--since` and `--until` for every time range. Spread one and replace
 * `description` when the command has its own default window or limits.
 */
export const sinceOption = {
  name: 'since',
  shorthand: 's',
  type: String,
  argument: 'TIME',
  deprecated: false,
  description: 'Start time: ISO 8601 or relative, like 1h or 7d',
} as const;

export const untilOption = {
  name: 'until',
  shorthand: 'u',
  type: String,
  argument: 'TIME',
  deprecated: false,
  description: 'End time: ISO 8601 or relative (default: now)',
} as const;

/**
 * `-e, --environment` for every environment choice. Spread it and replace
 * `description` when the command has its own default or accepted values.
 */
export const environmentOption = {
  name: 'environment',
  shorthand: 'e',
  type: String,
  argument: 'ENVIRONMENT',
  deprecated: false,
  description:
    'Environment: production, preview, development, or a custom environment',
} as const;

/** Hidden: `--target` is the old name of `--environment`. */
export const targetOption = {
  name: 'target',
  shorthand: null,
  type: String,
  argument: 'ENVIRONMENT',
  deprecated: true,
  description: 'Deprecated alias for `--environment`',
} as const;

/**
 * `--git-branch` for every Git branch. Spread it and replace `description`
 * for the command; `comments list` also makes it repeatable.
 */
export const gitBranchOption = {
  name: 'git-branch',
  shorthand: null,
  type: String,
  argument: 'BRANCH',
  deprecated: false,
  description: 'Git branch',
} as const;

export const forceOption = {
  name: 'force',
  shorthand: null,
  type: Boolean,
  deprecated: false,
} as const;

/**
 * Hidden: `--json` is the only documented way to ask for JSON. `--format json`
 * and `-F json` keep working so existing scripts don't break.
 */
export const formatOption = {
  name: 'format',
  shorthand: 'F',
  type: String,
  argument: 'FORMAT',
  description: 'Specify the output format (json)',
  deprecated: true,
} as const;

export const jsonOption = {
  name: 'json',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description: 'Output as JSON',
} as const;

export const nonInteractiveOption = {
  name: 'non-interactive',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description:
    'Run without interactive prompts (default: on when an agent is detected)',
} as const;

export const allOption = {
  name: 'all',
  shorthand: 'a',
  type: Boolean,
  deprecated: false,
  description: 'List resources across all projects',
} as const;

export const projectOption = {
  name: 'project',
  shorthand: 'p',
  type: String,
  argument: 'NAME_OR_ID',
  description: 'Project name or ID (default: linked project)',
  deprecated: false,
} as const;

export const deploymentOption = {
  name: 'deployment',
  shorthand: null,
  type: String,
  deprecated: false,
  description: 'The deployment ID or URL to target',
  argument: 'DEPLOYMENT',
} as const;

export const protectionBypassOption = {
  name: 'protection-bypass',
  shorthand: null,
  type: String,
  deprecated: false,
  description: 'Protection bypass secret for accessing protected deployments',
  argument: 'SECRET',
} as const;

type GlobalOpt = (typeof globalCommandOptions)[number];

const GLOBAL_LONG_TO_OPT = new Map<string, GlobalOpt>();
const GLOBAL_SHORT_TO_OPT = new Map<string, GlobalOpt>();
for (const opt of globalCommandOptions) {
  GLOBAL_LONG_TO_OPT.set(`--${opt.name}`, opt);
  for (const flag of getShortFlags(opt)) {
    GLOBAL_SHORT_TO_OPT.set(flag, opt);
  }
}

/**
 * Collects only global CLI flags from argv for suggested next commands.
 */
export interface GetGlobalFlagsFromArgsOptions {
  preserveProject?: boolean;
  preserveYes?: boolean;
  preserveConfig?: boolean;
}

export function getGlobalFlagsFromArgs(
  args: string[],
  options?: GetGlobalFlagsFromArgsOptions
): string[] {
  const delimiterIndex = args.indexOf('--');
  const cliArgs = delimiterIndex === -1 ? args : args.slice(0, delimiterIndex);
  const safeArgs = stripSensitiveAuthArgs(cliArgs);
  const out: string[] = [];
  for (let i = 0; i < safeArgs.length; i++) {
    const a = safeArgs[i];
    if (options?.preserveYes && (a === '--yes' || a === '-y')) {
      out.push(a);
      continue;
    }
    if (
      options?.preserveConfig &&
      (a === '--config' || a.startsWith('--config='))
    ) {
      out.push(a);
      if (a === '--config') {
        const next = safeArgs[i + 1];
        if (next && !next.startsWith('-')) {
          out.push(next);
          i++;
        }
      }
      continue;
    }
    let opt: GlobalOpt | undefined;
    if (a.startsWith('--') && a.includes('=')) {
      const name = a.slice(2).split('=')[0];
      opt = GLOBAL_LONG_TO_OPT.get(`--${name}`);
      if (opt) out.push(a);
      continue;
    }
    opt = GLOBAL_LONG_TO_OPT.get(a) || GLOBAL_SHORT_TO_OPT.get(a);
    if (!opt) continue;
    out.push(a);
    if (opt.type === String && !a.includes('=')) {
      const next = safeArgs[i + 1];
      if (next && !next.startsWith('-')) {
        out.push(next);
        i++;
      }
    }
  }
  if (options?.preserveProject) {
    const projectOption = findProjectOption(safeArgs);
    if (projectOption) out.push(...projectOption.args);
  }
  return out;
}

interface ProjectOptionFromArgs {
  value: string;
  args: string[];
}

function findProjectOption(args: string[]): ProjectOptionFromArgs | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') return undefined;
    if (arg.startsWith('--project=')) {
      return {
        value: arg.slice('--project='.length),
        args: [arg],
      };
    }
    if (arg === '--project' || getShortFlagLongName(arg) === '--project') {
      const value = args[i + 1];
      if (value && !value.startsWith('-')) {
        return { value, args: ['--project', value] };
      }
      return undefined;
    }
  }
  return undefined;
}

/**
 * Returns the explicit project selector from CLI arguments, ignoring arguments
 * passed to a child command after `--`.
 */
export function getProjectOptionFromArgs(args: string[]): string | undefined {
  return findProjectOption(args)?.value;
}
