import util from 'node:util';
import getCommonArgs from './arg-common';
import type { Prettify } from './types';

type parseArgs = typeof util.parseArgs;
type ParseArgsConfig = NonNullable<Parameters<parseArgs>[0]>;
type ParseArgsConfigOptions = NonNullable<ParseArgsConfig['options']>;

export interface Spec {
  [key: string]: any;
}

type Handler = (value: string, name: string, previousValue?: any) => any;

/**
 * Maps a flags specification to the shape returned under `flags`, mirroring the
 * type mapping the `arg` package used to provide:
 *
 * - `{ '--limit': Number }` → `{ '--limit'?: number }`
 * - `{ '--attach': [String] }` → `{ '--attach'?: string[] }`
 * - `{ '-a': '--attach' }` → `{ '-a'?: never }` (aliases are resolved to their
 *   long form during parsing, so they never appear in the output)
 *
 * Every key is optional because a flag is only present when passed.
 */
export type ParsedFlags<T extends Spec> = {
  [K in keyof T]?: T[K] extends Handler
    ? ReturnType<T[K]>
    : T[K] extends [Handler]
      ? Array<ReturnType<T[K][0]>>
      : never;
};

/** Specification of the flags every command accepts (`--help`, `--scope`, …). */
type CommonArgs = ReturnType<typeof getCommonArgs>;

type ArgOptions = {
  permissive?: boolean;
};

/**
 * @deprecated use `parseArguments` instead
 */
const getArgs = util.deprecate(function getArgs<T extends Spec>(
  argv: string[],
  flagsSpecification?: T,
  parserOptions: ArgOptions = {}
) {
  return parseArguments(
    argv,
    Object.assign({}, getCommonArgs(), flagsSpecification),
    {
      ...parserOptions,
    }
  );
}, 'getArgs is deprecated, use parseArguments instead');

export default getArgs;

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
export function parseArguments<T extends Spec>(
  args: string[],
  flagsSpecification?: T,
  parserOptions: ArgOptions = {}
): {
  args: string[];
  flags: Prettify<ParsedFlags<CommonArgs & T>>;
} {
  const options: ParseArgsConfigOptions = {
    help: {
      default: undefined,
      type: 'boolean',
      short: 'h',
    },
  };

  // Automatically include the global command options (e.g. `--token`, `--cwd`,
  // `--scope`, `--debug`, ...) so every caller of `parseArguments` recognizes
  // them without having to redeclare them. Caller-supplied flags take
  // precedence in case of collisions.
  const mergedSpecification: Spec = Object.assign(
    {},
    getCommonArgs(),
    flagsSpecification ?? {}
  );

  // Track which flags should have their string values coerced to numbers,
  // mirroring the behavior of the legacy `arg` parser.
  const numberKeys = new Set<string>();

  for (const [rawKey, value] of Object.entries(mergedSpecification)) {
    if (/^--\w/.test(rawKey)) {
      const key = rawKey.replace(/^--/, '');

      // Array types (e.g. `[String]` / `[Number]`) accept multiple values.
      const isMultiple = Array.isArray(value);
      const elementType = isMultiple ? value[0] : value;

      const isString = elementType === String || elementType instanceof String;
      const isNumber = elementType === Number || elementType instanceof Number;

      // Any flag that takes a value (String, Number, or an array of those)
      // must be declared as a `'string'` option for `util.parseArgs`.
      // Only bare `Boolean` flags remain `'boolean'`.
      const type: 'string' | 'boolean' =
        isString || isNumber ? 'string' : 'boolean';

      options[key] = {
        type,
        ...(isMultiple ? { multiple: true } : {}),
      };

      if (isNumber) {
        numberKeys.add(key);
      }
    }
  }

  for (const [rawKey, value] of Object.entries(mergedSpecification)) {
    if (/^-\w/.test(rawKey)) {
      const shortKey = rawKey.replace(/^-/, '');
      const parentKey = value.replace(/^--/, '');
      options[parentKey].short ??= shortKey;
    }
  }

  const parsed = util.parseArgs({
    args,
    allowPositionals: true,
    options,
    strict: !parserOptions.permissive,
    tokens: true,
  });

  const argsOutput: string[] = [];
  const flagsOutput: Record<string, any> = {};

  for (const token of parsed.tokens) {
    if (token.kind === 'option' && token.name === 'help') {
      flagsOutput[`--${token.name}`] = true;
    } else if (token.kind === 'option' && token.value !== undefined) {
      const flagKey = `--${token.name}`;
      const value = numberKeys.has(token.name)
        ? Number(token.value)
        : token.value;
      if (options[token.name]?.multiple) {
        const existing = flagsOutput[flagKey];
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          flagsOutput[flagKey] = [value];
        }
      } else {
        flagsOutput[flagKey] = value;
      }
    } else if (token.kind === 'option' && token.value === undefined) {
      // Boolean flags emit a token with no value. If the option is part of the
      // known specification, record it as a boolean flag. Otherwise (permissive
      // mode / unknown option) preserve it as a positional argument.
      if (options[token.name]) {
        flagsOutput[`--${token.name}`] = true;
      } else {
        argsOutput.push(token.rawName);
      }
    } else if (token.kind === 'positional') {
      argsOutput.push(token.value);
    }
  }

  return {
    args: argsOutput,
    flags: flagsOutput as Prettify<ParsedFlags<CommonArgs & T>>,
  };
}
