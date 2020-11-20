import { SystemEnvs } from './types';
import getSystemEnvValues from '../env/get-system-env-values';
import Client from '../client';
import { Output } from '../output';
import { Project, ProjectEnvType, ProjectEnvVariable } from '../../types';

export default async function exposeSystemEnvs(
  output: Output,
  client: Client,
  project: Project,
  projectEnvs: ProjectEnvVariable[]
) {
  const systemEnvs: SystemEnvs = {
    buildEnv: { VERCEL: '1', VERCEL_ENV: 'development' },
    runEnv: { VERCEL: '1', VERCEL_ENV: 'development' },
  };

  if (project.autoExposeSystemEnvs) {
    systemEnvs.buildEnv['VERCEL'] = '1';
    systemEnvs.buildEnv['VERCEL_ENV'] = 'development';
    systemEnvs.runEnv['VERCEL'] = '1';
    systemEnvs.runEnv['VERCEL_ENV'] = 'development';

    const { systemEnvValues } = await getSystemEnvValues(
      output,
      client,
      project.id
    );

    for (const key of systemEnvValues) {
      systemEnvs.buildEnv[key] = '';
      systemEnvs.runEnv[key] = '';
    }
  }

  for (let env of projectEnvs) {
    if (env.type === ProjectEnvType.System) {
      systemEnvs.buildEnv[env.key] = '';
      systemEnvs.runEnv[env.key] = '';
    }
  }

  return systemEnvs;
}
