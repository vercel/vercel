import type { Prettify, ToTitleCase } from '../types';
import type {
  Command,
  CommandArgument,
  CommandOption,
  PrimitiveConstructor,
} from '../../commands/help';

// ToTelemetryOptionName<{ name: 'foo', type: BooleanConstructor }> → 'trackCliFlagFoo'
// ToTelemetryOptionName<{ name: 'foo', type: StringConstructor }> → 'trackCliOptionFoo'
// ToTelemetryOptionName<{ name: 'foo', type: [StringConstructor] }> → 'trackCliOptionFoo'
type ToTelemetryOptionName<T extends CommandOption> =
  T['type'] extends BooleanConstructor
    ? `trackCliFlag${ToTitleCase<T['name']>}`
    : T['type'] extends StringConstructor
      ? `trackCliOption${ToTitleCase<T['name']>}`
      : T['type'] extends ReadonlyArray<StringConstructor>
        ? `trackCliOption${ToTitleCase<T['name']>}`
        : never;

// ToArgType<BooleanConstructor> → boolean
// ToArgType<StringConstructor> → string
// ToArgType<[StringConstructor]> → [string]
type ToArgType<T extends CommandOption['type']> = T extends readonly any[]
  ? [ToArgType<T[0]>]
  : T extends PrimitiveConstructor
    ? ReturnType<T>
    : never;

// TelemetryOptionMethods<{ name: 'foo', type: BooleanConstructor }> → { trackCliOptionFoo: (v: boolean | undefined) => void; }
type TelemetryOptionMethods<A extends readonly CommandOption[]> = {
  [K in A[number] as ToTelemetryOptionName<K>]: (
    v: ToArgType<K['type']> | undefined
  ) => void;
};

// TelemetryArgumentMethods<{ name: 'foo' }> → { trackCliArgumentFoo: (v: string | undefined) => void; }
type TelemetryArgumentMethods<A extends readonly CommandArgument[]> = {
  [K in A[number] as `trackCliArgument${ToTitleCase<K['name']>}`]: (
    v: string | undefined
  ) => void;
};

export type TelemetryMethods<T extends Command> = Prettify<
  TelemetryArgumentMethods<T['arguments']> &
    TelemetryOptionMethods<T['options']>
>;
