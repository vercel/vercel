import { ProjectEnvType, ProjectEnvVariable } from '../../types';
import { Env } from '@vercel/build-utils';

export default function exposeSystemEnvs(
  projectEnvs: ProjectEnvVariable[],
  systemEnvValues: string[],
  autoExposeSystemEnvs: boolean | undefined,
  vercelUrl?: string
) {
  const envs: Env = {};

  if (autoExposeSystemEnvs) {
    envs['VERCEL'] = '1';
    envs['VERCEL_ENV'] = 'development';
    envs['VERCEL_URL'] = vercelUrl || '';

    for (const key of systemEnvValues) {
      envs[key] = '';
    }
  }

  for (let env of projectEnvs) {
    if (env.type === ProjectEnvType.System) {
      envs[env.key] = '';
    } else {
      envs[env.key] = env.value;
    }
  }

  return envs;
}
