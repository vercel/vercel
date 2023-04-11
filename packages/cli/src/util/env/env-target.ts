import { PROJECT_ENV_TARGET } from '@vercel-internals/constants';
import type { ProjectEnvTargetValues } from '@vercel-internals/types';

export function getEnvTargetChoices() {
  return Object.entries(PROJECT_ENV_TARGET).map(([key, value]) => ({
    name: key,
    value: value,
  }));
}

export function isValidEnvTarget(
  target?: string
): target is ProjectEnvTargetValues | undefined {
  // Specify `Object.values` is return strings, instead of string constants so `.includes` works
  return (
    typeof target === 'undefined' ||
    Object.values<string>(PROJECT_ENV_TARGET).includes(target)
  );
}

export function getEnvTargetPlaceholder() {
  return `<${Object.values(PROJECT_ENV_TARGET).join(' | ')}>`;
}
