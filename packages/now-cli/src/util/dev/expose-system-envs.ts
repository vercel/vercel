import { SystemEnvs } from './types';
import getSystemEnvValues from '../env/get-system-env-values';
import Client from '../client';
import { Output } from '../output';
import { Project } from '../../types';

export default async function exposeSystemEnvs(
  output: Output,
  client: Client,
  project: Project
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

  // also read project envs here

  return systemEnvs;
}
