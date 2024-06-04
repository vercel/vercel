import { CommandOption, PrimitiveConstructor } from '../commands/help';

export function getFlagsSpecification(options: CommandOption[]) {
  const flagsSpecification: {
    [k: string]: PrimitiveConstructor | [PrimitiveConstructor] | string;
  } = {};
  for (const option of options) {
    flagsSpecification[`--${option.name}`] = option.type;
    if (option.shorthand) {
      flagsSpecification[`-${option.shorthand}`] = `--${option.name}`;
    }
  }

  return flagsSpecification;
}
