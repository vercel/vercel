import arg from 'arg';
import getCommonArgs from './arg-common';

type ParserOptions = {
  permissive?: boolean;
};

type Handler = (value: string) => any;

interface Spec {
  [key: string]: string | Handler | [Handler];
}

export default function parseArguments<T extends Spec>(
  args: string[],
  flags?: T,
  parserOptions: ParserOptions = {}
) {
  const { _: positional, ...rest } = arg(
    Object.assign({}, getCommonArgs(), flags),
    {
      ...parserOptions,
      argv: args,
    }
  );
  return { positional: positional, flags: rest };
}
