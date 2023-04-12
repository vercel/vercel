import type { ProjectEnvTarget } from '@vercel-internals/types';

export const envTargetChoices = [
  {
    name: 'Production',
    value: 'production',
  },
  {
    name: 'Preview',
    value: 'preview',
  },
  {
    name: 'Development',
    value: 'development',
  },
] as const;

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
  return `<${envTargetChoices.map<string>(c => c.value).join(' | ')}>`;
}
