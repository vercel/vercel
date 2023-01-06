import { Output } from '../../util/output';
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

export function getEnvTargetRequested(output: Output, argument?: string) {
  if (argument !== undefined) {
    output.debug(`Setting target to ${argument}.`);
    return argument.toLowerCase();
  }

  if (process.env['VERCEL_ENV']) {
    output.debug(
      `Setting target to ${process.env.VERCEL_ENV} using VERCEL_ENV environment variable.`
    );
    return process.env['VERCEL_ENV'];
  }

  return 'development';
}

export function isValidEnvTarget(
  target?: string
): target is ProjectEnvTarget | undefined {
  return typeof target === 'undefined' || envTargets().includes(target);
}

export function getEnvTargetPlaceholder() {
  return `<${envTargets().join(' | ')}>`;
}
