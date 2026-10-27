import { argvHasNonInteractive } from '../agent-output';
import { quoteArg } from '../flags/quote-arg';
import { packageName } from '../pkg-name';

// Deployment Environment Variable flags, which take `KEY=VALUE`.
const ENV_PAIR_FLAGS = ['--env', '--build-env'];

/**
 * Stands in for an Environment Variable value in the suggestion. Deploy
 * rejects it ({@link findEnvPlaceholder}), so running the suggestion without
 * filling it in fails before anything is created.
 */
export const ENV_VALUE_PLACEHOLDER = '<VALUE>';

// Deprecated names map to their canonical flag. `null` drops a flag that
// can't appear: the token, and deprecated flags that no longer change this
// deploy (`--name` is ignored when `--project` is set).
const CANONICAL_FLAGS: Record<string, string | null> = {
  '--token': null,
  '--confirm': '--yes',
  '--target': '--environment',
  '--team': '--scope',
  '--name': null,
  '--no-clipboard': null,
  '--no-logs': null,
};

/**
 * The invoking deploy with `--create-if-missing` added, so following the
 * suggestion repeats the same deploy (path, `--yes`, `--prebuilt`, and every
 * other option) and only adds consent to create the project.
 *
 * Built from the parsed arguments, so every flag uses its canonical long name
 * whatever the user typed (`-ye` becomes `--yes --env`). The token is removed,
 * and an Environment Variable value becomes a `<VALUE>` placeholder
 * (`-e KEY=VALUE` becomes `--env 'KEY=<VALUE>'`): dropping it would read
 * `KEY` from the shell, which can silently deploy a different value. `note`
 * then labels the placeholders as needing substitution.
 */
export function buildCreateIfMissingCommand(
  positionals: string[],
  flags: Record<string, unknown>,
  argv: string[]
): { command: string; note?: string } {
  const out = ['deploy', ...positionals];
  const seen = new Set<string>();
  let hasPlaceholder = false;
  for (const [typedName, value] of Object.entries(flags)) {
    const name =
      typedName in CANONICAL_FLAGS ? CANONICAL_FLAGS[typedName] : typedName;
    if (!name || name === '--create-if-missing' || seen.has(name)) {
      continue;
    }
    seen.add(name);
    if (name === '--non-interactive') {
      // `arg` reads `--non-interactive=false` as true.
      out.push(
        argvHasNonInteractive(argv)
          ? '--non-interactive'
          : '--non-interactive=false'
      );
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === true) {
        out.push(name);
      } else if (typeof item === 'string' || typeof item === 'number') {
        const text = String(item);
        const shown = ENV_PAIR_FLAGS.includes(name)
          ? withPlaceholder(text)
          : text;
        hasPlaceholder ||= shown !== text;
        out.push(name, shown);
      }
    }
  }
  out.push('--create-if-missing');
  const command = [packageName, ...out.map(quoteToken)].join(' ');
  return hasPlaceholder
    ? {
        command,
        note: `replace each ${ENV_VALUE_PLACEHOLDER} with the Environment Variable's value`,
      }
    : { command };
}

/**
 * The first `--env` or `--build-env` pair whose value is still the
 * suggestion's placeholder.
 */
export function findEnvPlaceholder(
  flags: Record<string, unknown>
): { flag: string; key: string } | undefined {
  for (const flag of ENV_PAIR_FLAGS) {
    const value = flags[flag];
    for (const pair of Array.isArray(value) ? value : [value]) {
      if (
        typeof pair === 'string' &&
        pair.endsWith(`=${ENV_VALUE_PLACEHOLDER}`)
      ) {
        return { flag, key: pair.slice(0, pair.indexOf('=')) };
      }
    }
  }
  return undefined;
}

// `KEY` alone reads from the shell, as typed, so it stays.
function withPlaceholder(pair: string): string {
  const equals = pair.indexOf('=');
  return equals >= 0
    ? `${pair.slice(0, equals)}=${ENV_VALUE_PLACEHOLDER}`
    : pair;
}

// `=` and `,` are literal in a shell word, so `--meta team=web` stays unquoted.
function quoteToken(token: string): string {
  return /^[A-Za-z0-9_./@:=,+-]+$/.test(token) ? token : quoteArg(token);
}
