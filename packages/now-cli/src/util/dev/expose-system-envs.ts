import { URL } from 'url';
import { ProjectEnvType, ProjectEnvVariable } from '../../types';
import { Env } from '@vercel/build-utils';

export default function exposeSystemEnvs(
  projectEnvs: ProjectEnvVariable[],
  systemEnvValues: string[],
  autoExposeSystemEnvs: boolean | undefined,
  url?: string
) {
  const systemEnvs: Env = {};

  if (autoExposeSystemEnvs) {
    systemEnvs['VERCEL'] = '1';
    systemEnvs['VERCEL_ENV'] = 'development';
    systemEnvs['VERCEL_URL'] = url ? new URL(url).host : '';

    for (const key of systemEnvValues) {
      systemEnvs[key] = '';
    }
  }

  for (let env of projectEnvs) {
    if (env.type === ProjectEnvType.System) {
      systemEnvs[env.key] = '';
    }
  }

  return systemEnvs;
}
