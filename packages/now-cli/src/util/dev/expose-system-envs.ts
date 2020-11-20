import getSystemEnvValues from '../env/get-system-env-values';
import Client from '../client';
import { Output } from '../output';
import { Project, ProjectEnvType, ProjectEnvVariable } from '../../types';
import { Env } from '@vercel/build-utils';

export default async function exposeSystemEnvs(
  output: Output,
  client: Client,
  project: Project,
  projectEnvs: ProjectEnvVariable[]
) {
  const systemEnvs: Env = { VERCEL: '1', VERCEL_ENV: 'development' };

  if (project.autoExposeSystemEnvs) {
    systemEnvs['VERCEL'] = '1';
    systemEnvs['VERCEL_ENV'] = 'development';

    const { systemEnvValues } = await getSystemEnvValues(
      output,
      client,
      project.id
    );

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
