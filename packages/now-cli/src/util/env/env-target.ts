import { ProjectEnvTarget } from '../../types';

function envTargets(): string[] {
  return Object.values(ProjectEnvTarget);
}

export function getEnvTargetChoices() {
  return Object.entries(ProjectEnvTarget).map(([key, value]) => ({
    name: key,
    value: value,
  }));
}

export function isValidEnvTarget(
  target?: string
): target is ProjectEnvTarget | undefined {
  return typeof target === 'undefined' || envTargets().includes(target);
}

export function getEnvTargetPlaceholder() {
  return `<${envTargets().join(' | ')}>`;
}
