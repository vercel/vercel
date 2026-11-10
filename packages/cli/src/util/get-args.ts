import arg from 'arg';
import getCommonArgs from './arg-common';
import type { Prettify } from './types';
import { suggestCorrection } from './command-correction';
import {
  DEPRECATED_SHORTHANDS,
  type DeprecatedShorthands,
  setCommandFlagsSpecification,
} from './get-flags-specification';
import { warnDeprecatedOption } from './warn-deprecated-subcommand';

export interface ArgumentError extends Error {
  code: string;
  invalidOption?: string;
  allowedOptions?: string[];
  suggestedOption?: string;
  flagsSpecification?: arg.Spec;
}

// API response fields must never be treated as locally verified CLI options.
const argumentErrors = new WeakSet<Error>();

export function isArgumentError(error: unknown): error is ArgumentError {
  return error instanceof Error && argumentErrors.has(error);
}

/**
 * Every Boolean `--x` also accepts `--no-x`, which turns it off: the same as
 * leaving `--x` out. An option that declares its own `--no-x` keeps it.
 * Returns the negations, keyed by `--no-x`, with the option each turns off.
 */
function getNegations(spec: arg.Spec): Map<string, string> {
  const negations = new Map<string, string>();
  for (const [name, type] of Object.entries(spec)) {
    if (
      type !== Boolean ||
      !name.startsWith('--') ||
      name.startsWith('--no-')
    ) {
      continue;
    }
    const negation = `--no-${name.slice(2)}`;
    if (!(negation in spec)) {
      negations.set(negation, name);
    }
  }
  return negations;
}

function conflictingOptionsError(name: string, negation: string) {
  const error = new Error(`Can't use ${name} with ${negation}.`) as Error & {
    code: string;
  };
  error.code = 'ARG_CONFLICTING_OPTIONS';
  argumentErrors.add(error);
  return error;
}

function parseWithSuggestions<T extends arg.Spec>(
  args: string[],
  spec: T,
  options: ArgOptions
) {
  const negations = options.keepNegations
    ? new Map<string, string>()
    : getNegations(spec);
  try {
    const negationSpec: arg.Spec = {};
    for (const negation of negations.keys()) {
      negationSpec[negation] = Boolean;
    }
    const result = arg(
      { ...spec, ...negationSpec },
      { ...options, argv: args }
    ) as arg.Result<T> & Record<string, unknown>;
    for (const [negation, name] of negations) {
      if (result[negation] === undefined) {
        continue;
      }
      delete result[negation];
      // A permissive parse routes or reads a few options, some of them in the
      // middle of startup, so it leaves the conflict to the command's own
      // strict parse instead of throwing.
      if (result[name] !== undefined && !options.permissive) {
        throw conflictingOptionsError(name, negation);
      }
    }
    return result as arg.Result<T>;
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      [
        'ARG_UNKNOWN_OPTION',
        'ARG_MISSING_REQUIRED_LONGARG',
        'ARG_MISSING_REQUIRED_SHORTARG',
      ].includes(String(error.code))
    ) {
      const err = error as ArgumentError;
      const option =
        /(?:unknown or unexpected option|option requires argument(?: \([^)]*\))?): (--?[A-Za-z0-9-]+)(?: \(alias for --?[A-Za-z0-9-]+\))?$/.exec(
          err.message
        )?.[1];
      if (option) {
        argumentErrors.add(err);
        err.invalidOption = option;
        err.allowedOptions = Object.keys(spec)
          .filter(name => name.startsWith('--'))
          .sort();
        if (err.code === 'ARG_UNKNOWN_OPTION') {
          err.suggestedOption = suggestCorrection(option, err.allowedOptions);
        }
        err.flagsSpecification = spec;
      }
    }
    throw error;
  }
}

type ArgOptions = {
  permissive?: boolean;
  stopAtPositional?: boolean;
  /**
   * Leave `--no-x` among the positional arguments, as an option the parser
   * doesn't know, for argv handed to another program.
   */
  keepNegations?: boolean;
};

/**
 * @deprecated use `parseArguments` instead
 */
export default function getArgs<T extends arg.Spec>(
  argv: string[],
  argsOptions?: T,
  argOptions: ArgOptions = {}
) {
  return parseWithSuggestions(
    argv,
    Object.assign({}, getCommonArgs(), argsOptions),
    argOptions
  );
}

type ParserOptions = {
  permissive?: boolean;
  /** See `ArgOptions`. */
  keepNegations?: boolean;
  /**
   * Set to `false` for parses that only inspect argv, so deprecation
   * warnings print once, from the command's own parse.
   */
  warnDeprecated?: boolean;
  /**
   * Indexes in `args` of global short flags that belong to the selected
   * command instead (see `findCommandShorthands`). A permissive parse leaves
   * each one, and the value after it, among the positional arguments.
   */
  commandShorthands?: ReadonlySet<number>;
};

// Stands in for a command's own short flag during a permissive parse. The
// parser doesn't know it, so it keeps it among the positional arguments.
const COMMAND_SHORTHAND_PLACEHOLDER = '--\0command-shorthand-';

/**
 * Parses command line arguments.
 * Automatically includes a number of common flags such as `--help`.
 *
 * **Migrating from `getArgs`**
 *
 * This function is designed to replace `getArgs`
 * and will live alongside `getArgs` until the migration is completed.
 *
 * It takes the same three arguments as `getArgs` with improved names: `args`, `flagsSpecification`, and `parserOptions`.
 * It also changes the return type to be an object with two keys: `{args, flags}`
 *
 * - `args` was previously returned under the `_` key
 * - `flags` previously these keys were mixed with the positional arguments
 */
export function parseArguments<T extends arg.Spec>(
  args: string[],
  flagsSpecification?: T,
  parserOptions: ParserOptions = {}
) {
  // currently parseArgument (and arg as a whole) will hang
  // if there are cycles in the flagsSpecification
  const spec = Object.assign({}, getCommonArgs(), flagsSpecification);
  const { commandShorthands } = parserOptions;
  const keepForCommand = Boolean(
    parserOptions.permissive && commandShorthands?.size
  );
  const { _: parsed, ...rest } = parseWithSuggestions(
    keepForCommand
      ? args.map((arg, index) =>
          commandShorthands!.has(index)
            ? `${COMMAND_SHORTHAND_PLACEHOLDER}${index}`
            : arg
        )
      : args,
    spec,
    parserOptions
  );
  const positional = keepForCommand
    ? parsed.map(arg =>
        arg.startsWith(COMMAND_SHORTHAND_PLACEHOLDER)
          ? args[Number(arg.slice(COMMAND_SHORTHAND_PLACEHOLDER.length))]
          : arg
      )
    : parsed;
  // Routers parse permissively before the subcommand parses strictly, so only
  // the strict parse warns.
  if (!parserOptions.permissive && parserOptions.warnDeprecated !== false) {
    setCommandFlagsSpecification(spec);
    warnDeprecatedShorthands(args, spec, parserOptions);
  }
  return { args: positional, flags: rest as Prettify<typeof rest> };
}

// Hidden short flags used in this run, and the ones already warned about, so
// each warns once however many times the command parses.
const usedShorthands = new Set<string>();
const warnedShorthands = new Set<string>();

/** The hidden short flags used in this run, such as `-d`, for telemetry. */
export function getUsedDeprecatedShorthands(): string[] {
  return [...usedShorthands];
}

/** Forgets which hidden short flags were used, for tests that run many times. */
export function resetDeprecatedShorthands() {
  usedShorthands.clear();
  warnedShorthands.clear();
}

/**
 * Warns for each hidden short flag in `args`, such as `-d` for
 * `--description`. The real parse maps it straight to the long name, so this
 * parses again with each hidden letter as its own key, of the same type, to
 * see which spelling was used.
 */
function warnDeprecatedShorthands(
  args: string[],
  spec: arg.Spec,
  parserOptions: ParserOptions
) {
  const shorthands = (spec as DeprecatedShorthands)[DEPRECATED_SHORTHANDS];
  if (!shorthands?.length) {
    return;
  }
  const names = new Map<string, string>();
  const splitSpec: arg.Spec = { ...spec };
  for (const shorthand of shorthands) {
    const name = spec[shorthand];
    if (typeof name !== 'string') {
      continue;
    }
    const handler = resolveHandler(spec, name);
    if (handler === undefined) {
      continue;
    }
    names.set(shorthand, name);
    splitSpec[shorthand] = handler;
  }
  let flags: arg.Result<arg.Spec>;
  try {
    flags = parseWithSuggestions(args, splitSpec, parserOptions);
  } catch {
    return;
  }
  for (const [shorthand, name] of names) {
    if (flags[shorthand] === undefined) {
      continue;
    }
    usedShorthands.add(shorthand);
    const warning = `${shorthand} ${name}`;
    if (!warnedShorthands.has(warning)) {
      warnedShorthands.add(warning);
      warnDeprecatedOption(args, shorthand, name);
    }
  }
}

/** The type `spec` gives `name`, following aliases such as `-s` to `--search`. */
function resolveHandler(
  spec: arg.Spec,
  name: string
): Exclude<arg.Spec[string], string> | undefined {
  let handler = spec[name];
  while (typeof handler === 'string') {
    handler = spec[handler];
  }
  return handler;
}

/**
 * Parses `args` again with `shortFlag`, such as `-s`, as its own key instead
 * of the long option it stands for, to see which spelling was typed. The
 * letter takes `handler`, by default the long option's own type. This only
 * inspects argv: it is permissive, never warns, and returns no flags when
 * `args` don't parse.
 */
export function parseWithShortFlag(
  args: string[],
  spec: arg.Spec,
  shortFlag: `-${string}`,
  handler: arg.Spec[string] | undefined = resolveHandler(spec, shortFlag)
): Record<string, unknown> {
  if (handler === undefined) {
    return {};
  }
  try {
    return parseArguments(
      args,
      { ...spec, [shortFlag]: handler },
      { permissive: true, warnDeprecated: false }
    ).flags;
  } catch {
    return {};
  }
}

/**
 * The spelling typed for the hidden old option `name`: one of its short
 * flags, such as `-s` for `--search`, or `name` itself. A renamed option's
 * warning and conflict error name what was typed. A short flag it finds is
 * counted with the other hidden short flags, for telemetry.
 */
export function getTypedOptionName(
  args: string[],
  spec: arg.Spec,
  name: `--${string}`
): string {
  for (const [key, target] of Object.entries(spec)) {
    if (
      target === name &&
      /^-[^-]$/.test(key) &&
      parseWithShortFlag(args, spec, key as `-${string}`)[key] !== undefined
    ) {
      usedShorthands.add(key);
      return key;
    }
  }
  return name;
}

/** Removes only the command token, retaining flags, their values, and `--`. */
export function takeCommand(argv: string[], flagsSpecification: arg.Spec) {
  const { _: positional } = parseWithSuggestions(
    argv,
    Object.assign({}, getCommonArgs(), flagsSpecification),
    { stopAtPositional: true }
  );
  const index = argv.length - positional.length;
  return {
    command: positional[0],
    args: [...argv.slice(0, index), ...argv.slice(index + 1)],
  };
}
