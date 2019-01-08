import arg from 'arg';
import getCommonArgs from './arg-common';

type ArgOptions = {
  permissive?: boolean;
};

type Handler = (value: string) => any;

interface Spec {
  [key: string]: string | Handler | [Handler];
}

export default function getArgs<T extends Spec>(
  argv: string[],
  argsOptions: T,
  argOptions: ArgOptions = {}
) {
  return arg(Object.assign({}, getCommonArgs(), argsOptions), {
    ...argOptions,
    argv
  });
}
