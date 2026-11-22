import type arg from 'arg';
import type { CommandOption } from '../commands/help';
import type { Prettify } from './types';

// Distribute over unions too, including options read through `CommandOption`.
type ToArgHandler<T> = T extends ReadonlyArray<infer Handler> ? [Handler] : T;

// TS type that inputs a `CommandOption` and outputs a type that is compatible
// with the `arg` package's `Spec` type. For example:
//
// ### Input
// ToArgSpec<{ name: 'foo'; type: StringConstructor; shorthand: 'f' }>
//
// ### Output
// { '--foo': StringConstructor; '-f': '--foo' }
type ToArgSpec<T extends CommandOption> = {
  [K in T as `--${K['name']}`]: ToArgHandler<K['type']>;
} & {
  [K in T as K['shorthand'] extends string
    ? `-${K['shorthand']}`
    : never]: `--${K['name']}`;
};

/**
 * Lists the hidden short flags of a flags specification, such as `-d` when it
 * only stays as the old short form of `--description`. A symbol keeps it out
 * of the parser's view, and object spreads keep it when specs are combined.
 */
export const DEPRECATED_SHORTHANDS = Symbol('deprecated shorthands');

export type DeprecatedShorthands = {
  [DEPRECATED_SHORTHANDS]?: readonly string[];
};

// Guide letters that code reading argv by hand must treat like their long
// names: `-p` for `--project` and `-n` for `--limit`.
const SHORT_FLAG_LONG_NAMES: Readonly<Record<string, string>> = {
  '-p': '--project',
  '-n': '--limit',
};

// The flags specification of the running command's own parse.
let commandFlagsSpecification: arg.Spec | undefined;

/** Remembers the flags specification of the running command's own parse. */
export function setCommandFlagsSpecification(spec: arg.Spec | undefined) {
  commandFlagsSpecification = spec;
}

/**
 * The long name that a short flag stands for in the running command, for
 * code that reads argv by hand: `--project` for `-p` and `--limit` for `-n`,
 * unless the command gives the letter another meaning, like `-p` for
 * `--position` in `flags rules add`. A group such as `-yp` stands for its
 * last letter. Before the command's own parse, the guide's meaning applies.
 * Returns `undefined` for every other flag.
 */
export function getShortFlagLongName(
  flag: string,
  spec: arg.Spec | undefined = commandFlagsSpecification
): string | undefined {
  if (!/^-[A-Za-z]+$/.test(flag)) {
    return undefined;
  }
  const letter = `-${flag.slice(-1)}`;
  const name = SHORT_FLAG_LONG_NAMES[letter];
  if (name === undefined || (spec !== undefined && spec[letter] !== name)) {
    return undefined;
  }
  return name;
}

/** Every short flag that parses as `option`, shown and hidden, like `-d`. */
export function getShortFlags(option: CommandOption): string[] {
  return [option.shorthand, option.deprecatedShorthand]
    .filter((letter): letter is string => Boolean(letter))
    .map(letter => `-${letter}`);
}

export function getFlagsSpecification<T extends ReadonlyArray<CommandOption>>(
  options: T
): Prettify<ToArgSpec<T[number]>> {
  const flagsSpecification: arg.Spec = {};
  const deprecatedShorthands = new Set<string>();

  for (const option of options) {
    // @ts-expect-error - TypeScript complains about `readonly` modifier
    flagsSpecification[`--${option.name}`] = option.type;
    if (option.shorthand) {
      flagsSpecification[`-${option.shorthand}`] = `--${option.name}`;
    }
    if (option.deprecatedShorthand) {
      flagsSpecification[`-${option.deprecatedShorthand}`] = `--${option.name}`;
      deprecatedShorthands.add(`-${option.deprecatedShorthand}`);
    }
  }

  // Hidden: `-N` was the short form of `--next`. Help no longer shows it, but
  // it keeps working on every command with `--next`.
  if (flagsSpecification['--next'] && !flagsSpecification['-N']) {
    flagsSpecification['-N'] = '--next';
    deprecatedShorthands.add('-N');
  }

  if (deprecatedShorthands.size > 0) {
    (flagsSpecification as DeprecatedShorthands)[DEPRECATED_SHORTHANDS] = [
      ...deprecatedShorthands,
    ];
  }

  return flagsSpecification as Prettify<ToArgSpec<T[number]>>;
}
