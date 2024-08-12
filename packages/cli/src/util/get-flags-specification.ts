import arg from 'arg';
import { CommandOption } from '../commands/help';
import type { Prettify } from './types';

type ToArgSpec<T extends CommandOption> = {
  [K in T as `--${K['name']}`]: K['type'];
} & {
  [K in T as K['shorthand'] extends string
    ? `-${K['shorthand']}`
    : never]: `--${K['name']}`;
};

export function getFlagsSpecification<T extends ReadonlyArray<CommandOption>>(
  options: T
): Prettify<ToArgSpec<T[number]>> {
  const flagsSpecification: arg.Spec = {};

  for (const option of options) {
    // @ts-expect-error - TypeScript complains about `readonly` modifier
    flagsSpecification[`--${option.name}`] = option.type;
    if (option.shorthand) {
      flagsSpecification[`-${option.shorthand}`] = `--${option.name}`;
    }
  }

  return flagsSpecification as Prettify<ToArgSpec<T[number]>>;
}
