import arg from 'arg';
import { ARG_COMMON } from './arg-common';

interface ArgOptions {
  permissive?: boolean;
}

export default function getArgs<T extends arg.Spec>(
  argv: string[],
  spec?: T,
  opts?: ArgOptions,
) {
  return arg({ ...ARG_COMMON, ...spec } as const, {
    ...opts,
    argv,
  });
}
