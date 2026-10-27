export type FlagsSpecification = Record<string, unknown>;

function getFlagSpecValue(
  flagsSpecification: FlagsSpecification,
  flag: string
): unknown {
  const value = flagsSpecification[flag];
  if (typeof value === 'string') {
    return flagsSpecification[value];
  }
  return value;
}

function flagConsumesValue(
  rawArg: string,
  flagsSpecification: FlagsSpecification
): boolean {
  if (!rawArg.startsWith('-') || rawArg === '-' || rawArg.includes('=')) {
    return false;
  }

  const value = getFlagSpecValue(flagsSpecification, rawArg);
  return value === String || value === Number || Array.isArray(value);
}

export function findCommandIndex(
  rawArgs: string[],
  commandName: string | undefined,
  flagsSpecification: FlagsSpecification
): number {
  if (!commandName) {
    return -1;
  }

  for (let index = 0; index < rawArgs.length; index++) {
    const rawArg = rawArgs[index];
    if (rawArg === '--') {
      return rawArgs.indexOf(commandName, index + 1);
    }

    if (rawArg.startsWith('-')) {
      if (flagConsumesValue(rawArg, flagsSpecification)) {
        index++;
      }
      continue;
    }

    if (rawArg === commandName) {
      return index;
    }
  }

  return -1;
}

export function normalizeHelpAlias(rawArgs: string[]): string[] {
  return rawArgs.map(arg => (arg === '-help' ? '--help' : arg));
}
