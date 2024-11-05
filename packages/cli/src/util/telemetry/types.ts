import type { Prettify, ToTitleCase } from '../types';
import type {
  Command,
  CommandArgument,
  CommandOption,
  PrimitiveConstructor,
} from '../../commands/help';

// ToTelemetryOptionNameByType<'foo', BooleanConstructor> → 'trackCliFlagFoo'
// ToTelemetryOptionNameByType<'foo', StringConstructor> → 'trackCliOptionFoo'
// ToTelemetryOptionNameByType<'foo', NumberConstructor> → 'trackCliOptionFoo'
type ToTelemetryOptionNameByType<
  Name extends string,
  Type extends PrimitiveConstructor,
> = Type extends BooleanConstructor
  ? `trackCliFlag${ToTitleCase<Name>}`
  : `trackCliOption${ToTitleCase<Name>}`;

// ToTelemetryOptionName<{ name: 'foo', type: BooleanConstructor }> → 'trackCliFlagFoo'
// ToTelemetryOptionName<{ name: 'foo', type: StringConstructor }> → 'trackCliOptionFoo'
// ToTelemetryOptionName<{ name: 'foo', type: NumberConstructor }> → 'trackCliOptionFoo'
// ToTelemetryOptionName<{ name: 'foo', type: [StringConstructor] }> → 'trackCliOptionFoo'
// ToTelemetryOptionName<{ name: 'foo', type: [NumberConstructor] }> → 'trackCliOptionFoo'
type ToTelemetryOptionName<Opt extends CommandOption> =
  Opt['type'] extends readonly PrimitiveConstructor[]
    ? ToTelemetryOptionNameByType<Opt['name'], Opt['type'][0]>
    : Opt['type'] extends PrimitiveConstructor
      ? ToTelemetryOptionNameByType<Opt['name'], Opt['type']>
      : never;

// ToArgType<BooleanConstructor> → boolean
// ToArgType<StringConstructor> → string
// ToArgType<[StringConstructor]> → [string]
type ToArgType<OptType extends CommandOption['type']> =
  OptType extends readonly PrimitiveConstructor[]
    ? [ToArgType<OptType[0]>]
    : OptType extends PrimitiveConstructor
      ? ReturnType<OptType>
      : never;

// TelemetryOptionMethods<[{ name: 'foo', type: BooleanConstructor }]> → { trackCliFlagFoo: (value: boolean | undefined) => void; }
type TelemetryOptionMethods<Opts extends readonly CommandOption[]> = {
  [Opt in Opts[number] as ToTelemetryOptionName<Opt>]: (
    value: ToArgType<Opt['type']> | undefined
  ) => void;
};

type TelemetryArgumentParam<Arg extends CommandArgument> =
  Arg['multiple'] extends true ? string[] : string | undefined;

// TelemetryArgumentMethods<[{ name: 'foo' }]> → { trackCliArgumentFoo: (value: string | undefined) => void; }
type TelemetryArgumentMethods<Args extends readonly CommandArgument[]> = {
  [Arg in Args[number] as `trackCliArgument${ToTitleCase<Arg['name']>}`]: (
    value: TelemetryArgumentParam<Arg>
  ) => void;
};

// TelemetrySubcommandMethods<[{ name: 'foo' }]> → { trackCliSubcommandFoo: (actual: string) => void; }
type TelemetrySubcommandMethodsNonNull<Args extends readonly Command[]> = {
  [Arg in Args[number] as `trackCliSubcommand${ToTitleCase<Arg['name']>}`]: (
    actual: string
  ) => void;
};
type TelemetrySubcommandMethods<Args> = Args extends readonly Command[]
  ? TelemetrySubcommandMethodsNonNull<Args>
  : {};

export type TelemetryMethods<Cmd extends Command> = Prettify<
  TelemetrySubcommandMethods<Cmd['subcommands']> &
    TelemetryArgumentMethods<Cmd['arguments']> &
    TelemetryOptionMethods<Cmd['options']>
>;
