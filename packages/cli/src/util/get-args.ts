import util from 'node:util';
import getCommonArgs from './arg-common';
import type { Prettify } from './types';

type parseArgs = typeof util.parseArgs;
type ParseArgsConfig = NonNullable<Parameters<parseArgs>[0]>;
type ParseArgsConfigOptions = NonNullable<ParseArgsConfig['options']>;

export interface Spec {
  [key: string]: any;
}

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
  flags: Record<string, any>;
} {
  const options: ParseArgsConfigOptions = {
    help: {
      default: undefined,
      type: 'boolean',
      short: 'h',
    },
  };

  for (const [rawKey, value] of Object.entries(flagsSpecification ?? {})) {
    if (/^--\w/.test(rawKey)) {
      const key = rawKey.replace(/^--/, '');
      const type =
        value === String || value instanceof String ? 'string' : 'boolean';
      options[key] = {
        type,
      };
    }
  }

  for (const [rawKey, value] of Object.entries(flagsSpecification ?? {})) {
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
      flagsOutput[`--${token.name}`] = token.value;
    } else if (token.kind === 'option' && token.value === undefined) {
      argsOutput.push(token.rawName);
    } else if (token.kind === 'positional') {
      argsOutput.push(token.value);
    }
  }

  return {
    args: argsOutput,
    flags: flagsOutput as Prettify<typeof flagsOutput>,
  };
}
