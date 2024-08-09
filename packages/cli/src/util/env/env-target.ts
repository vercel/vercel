import type { ProjectEnvTarget } from '@vercel-internals/types';
import { PROJECT_ENV_TARGET } from '@vercel-internals/constants';
import title from 'title';

export const envTargetChoices = PROJECT_ENV_TARGET.map(t => ({
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
