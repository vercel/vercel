import arg from 'arg';
import getCommonArgs from './arg-common';

type ArgOptions = {
  permissive?: boolean;
};

type Handler = (value: string) => any;

interface Spec {
  [key: string]: string | Handler | [Handler];
}

/**
 * @deprecated use `parseArguments` instead
 */
export default function getArgs<T extends Spec>(
  argv: string[],
  argsOptions?: T,
  argOptions: ArgOptions = {}
) {
  return arg(Object.assign({}, getCommonArgs(), argsOptions), {
    ...argOptions,
    argv,
  });
}

type ParserOptions = {
  permissive?: boolean;
};

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
  parserOptions: ParserOptions = {}
) {
  // currently parseArgument (and arg as a whole) will hang
  // if there are cycles in the flagsSpecification
  const { _: positional, ...rest } = arg(
    Object.assign({}, getCommonArgs(), flagsSpecification),
    {
      ...parserOptions,
      argv: args,
    }
  );
  return { args: positional, flags: rest };
}
