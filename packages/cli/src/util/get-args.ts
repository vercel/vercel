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
 * @deprecated
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
