import type { ProjectEnvTarget } from '@vercel-internals/types';
import { VERCEL_SYSTEM_ENVIRONMENTS } from '@vercel-internals/constants';
import title from 'title';

export const envTargetChoices = VERCEL_SYSTEM_ENVIRONMENTS.map(t => ({
  name: title(t),
  value: t,
}));

export function isValidEnvTarget(
  target?: string
): target is ProjectEnvTarget | undefined {
  // Specify `map` returns strings, instead of string constants so `.includes` works
  return (
    typeof target === 'undefined' ||
    envTargetChoices.map<string>(c => c.value).includes(target)
  );
}

export function getEnvTargetPlaceholder() {
  return `<${envTargetChoices.map(c => c.value).join(' | ')}>`;
}
