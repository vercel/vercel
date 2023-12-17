import title from 'title';
import type { ProjectEnvVariable } from '@vercel-internals/types';

export default function formatEnvTarget(env: ProjectEnvVariable): string {
  const target = (Array.isArray(env.target) ? env.target : [env.target || ''])
    .map(t => title(t))
    .join(', ');

  return env.gitBranch ? `${target} (${env.gitBranch})` : target;
}
