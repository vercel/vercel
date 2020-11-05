import { ProjectEnvType } from '../../types';

function envTypes(): string[] {
  return Object.values(ProjectEnvType);
}

export function isValidEnvType(
  type?: string
): type is ProjectEnvType | undefined {
  return typeof type === 'undefined' || envTypes().includes(type);
}

export function getEnvTypePlaceholder() {
  return `<${envTypes().join(' | ')}>`;
}
