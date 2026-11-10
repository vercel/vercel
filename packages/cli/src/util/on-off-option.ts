import type Client from './client';
import type { CommandOption } from '../commands/help';
import { warnDeprecatedInput } from './warn-deprecated-subcommand';

/** Tokens an old on/off value could have been, like `on`, `false`, or `yes`. */
const VALUE_LIKE = /^(on|off|true|false|yes|no|1|0|enabled?|disabled?)$/i;

function negationOf(name: string): string {
  return `--no-${name.slice(2)}`;
}

export interface OnOffOptionNames {
  /** The option that turns the setting on, such as `--enable`. */
  readonly on: `--${string}`;
  /** Its `--no-` form, which turns the setting off. */
  readonly off: `--no-${string}`;
  /** A hidden old name that still turns it on, such as `--enabled`. */
  readonly oldOn?: `--${string}`;
  /** A hidden old name that still turns it off, such as `--disabled`. */
  readonly oldOff?: `--${string}`;
}

export type OnOffOption = { value: boolean | undefined } | { error: string };

/**
 * Reads an on/off setting given as `--x` or `--no-x`, plus any hidden old
 * names it replaced, such as `--enabled` and `--disabled` for `--enable` and
 * `--no-enable`. An old name keeps working and warns that it is deprecated.
 * Turning the setting both on and off is a usage error, returned as `error`.
 */
export function readOnOffOption(
  client: Client,
  flags: Readonly<Record<string, unknown>>,
  names: OnOffOptionNames
): OnOffOption {
  const typed = (name: string | undefined): name is string =>
    name !== undefined && flags[name] === true;
  const onNames = [names.on, names.oldOn].filter(typed);
  const offNames = [names.off, names.oldOff].filter(typed);
  if (onNames.length > 0 && offNames.length > 0) {
    return { error: `Can't use ${onNames[0]} with ${offNames[0]}.` };
  }
  if (names.oldOn && onNames.includes(names.oldOn)) {
    warnDeprecatedInput(client, names.oldOn, names.on);
  }
  if (names.oldOff && offNames.includes(names.oldOff)) {
    warnDeprecatedInput(client, names.oldOff, names.off);
  }
  return {
    value: onNames.length > 0 ? true : offNames.length > 0 ? false : undefined,
  };
}

export type LegacyOnOffValuesResult =
  | {
      args: string[];
      /** The old value each option was given, such as `on`, for telemetry. */
      legacy: Map<string, string>;
    }
  | { error: string };

/**
 * Rewrites the old value forms of the on/off options in `options` that have
 * `legacyValues`, such as `--fluid-compute on` or `--public=false`, to
 * `--fluid-compute` and `--no-public`, so the command parses them as presence
 * flags. With a `client`, a deprecated form warns; leave it out to rewrite a
 * suggested command quietly. `--x=true` and `--x=false` are the guide's forms
 * and don't warn. A value the option never took is a usage error, returned as
 * `error`, so a typo can't turn into a positional argument.
 */
export function rewriteLegacyOnOffValues(
  args: readonly string[],
  options: ReadonlyArray<CommandOption>,
  client?: Client
): LegacyOnOffValuesResult {
  const legacyOptions = options.filter(option => option.legacyValues);
  const out: string[] = [];
  const legacy = new Map<string, string>();
  const end = args.indexOf('--');
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (end !== -1 && i >= end) {
      out.push(token);
      continue;
    }
    const option = legacyOptions.find(
      candidate =>
        token === `--${candidate.name}` ||
        token.startsWith(`--${candidate.name}=`)
    );
    if (!option?.legacyValues) {
      out.push(token);
      continue;
    }
    const name = `--${option.name}`;
    const negation = negationOf(name);
    const { on, off } = option.legacyValues;
    const invalid = {
      error: `${name} doesn't take a value. Use ${name} or ${negation}.`,
    };

    if (token === name) {
      const next = args[i + 1];
      if (next === undefined || (end !== -1 && i + 1 >= end)) {
        out.push(token);
      } else if (next === on || next === off) {
        out.push(next === on ? name : negation);
        legacy.set(name, next);
        if (client) {
          warnDeprecatedInput(
            client,
            `${name} ${next}`,
            next === on ? name : negation
          );
        }
        i++;
      } else if (VALUE_LIKE.test(next)) {
        return invalid;
      } else {
        out.push(token);
      }
      continue;
    }

    const value = token.slice(name.length + 1);
    if (value === 'true' || value === 'false') {
      out.push(value === 'true' ? name : negation);
    } else if (value === on || value === off) {
      out.push(value === on ? name : negation);
      legacy.set(name, value);
      if (client) {
        warnDeprecatedInput(client, token, value === on ? name : negation);
      }
    } else {
      return invalid;
    }
  }
  return { args: out, legacy };
}

/**
 * Warnings for `--x=false` on an on/off option. The parser reads it as `--x`,
 * so it turns the option on; the next major version will make it turn it off.
 * Options with `legacyValues` read `=false` themselves, options with
 * `rejectsValue` refuse it, and the entry point reads `--non-interactive=false`,
 * so they never warn.
 */
export function getFalseValueWarnings(
  args: readonly string[],
  options: ReadonlyArray<CommandOption>
): string[] {
  const booleans = new Set(
    options
      .filter(
        option =>
          option.type === Boolean &&
          !option.legacyValues &&
          !option.rejectsValue &&
          option.name !== 'non-interactive'
      )
      .map(option => option.name)
  );
  const warnings = new Set<string>();
  for (const token of args) {
    if (token === '--') {
      break;
    }
    const match = /^--([^=]+)=(.*)$/.exec(token);
    if (!match || !booleans.has(match[1]) || !/^false$/i.test(match[2])) {
      continue;
    }
    const name = `--${match[1]}`;
    warnings.add(
      match[1].startsWith('no-')
        ? `${token} turns ${name} on. Leave out ${name} to turn it off.`
        : `${token} turns ${name} on. Use ${negationOf(name)} to turn it off.`
    );
  }
  return [...warnings];
}
