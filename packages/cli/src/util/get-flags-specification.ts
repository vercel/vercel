import type arg from 'arg';
import type { CommandOption } from '../commands/help';
import type { Prettify } from './types';

// TS type that inputs a `CommandOption` and outputs a type that is compatible
// with the `arg` package's `Spec` type. For example:
//
// ### Input
// ToArgSpec<{ name: 'foo'; type: StringConstructor; shorthand: 'f' }>
//
// ### Output
// { '--foo': StringConstructor; '-f': '--foo' }
type ToArgSpec<T extends CommandOption> = {
  [K in T as `--${K['name']}`]: K['type'] extends readonly [any]
    ? // Array types need special handling to remove the `readonly` modifier
      [K['type'][0]]
    : K['type'];
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
