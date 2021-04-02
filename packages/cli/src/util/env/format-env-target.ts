//@ts-ignore Missing types for 'title'
import title from 'title';
import { ProjectEnvVariable } from '../../types';

export default function formatEnvTarget(env: ProjectEnvVariable): string {
  const target = (Array.isArray(env.target) ? env.target : [env.target || ''])
    .map(title)
    .join(', ');

  return env.gitBranch ? `${target} (${env.gitBranch})` : target;
}
