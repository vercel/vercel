import { ProjectEnvType, ProjectEnvVariable } from '../../types';
import { Env } from '@vercel/build-utils';

function getSystemEnvValue(
  systemEnvRef: string,
  { vercelUrl }: { vercelUrl?: string }
) {
  if (systemEnvRef === 'VERCEL_URL') {
    return vercelUrl || '';
  }

  return '';
}

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

    for (const key of systemEnvValues) {
      envs[key] = getSystemEnvValue(key, { vercelUrl });
    }
  }

  for (let env of projectEnvs) {
    if (env.type === ProjectEnvType.System) {
      envs[env.key] = getSystemEnvValue(env.value, { vercelUrl });
    } else {
      envs[env.key] = env.value;
    }
  }

  return envs;
}
