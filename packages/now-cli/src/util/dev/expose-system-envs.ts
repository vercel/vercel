import { SystemEnvs } from './types';
import getSystemEnvValues from '../env/get-system-env-values';
import Client from '../client';
import { Output } from '../output';

export default async function exposeSystemEnvs(
  output: Output,
  client: Client,
  projectId: string
) {
  const systemEnvs: SystemEnvs = {
    buildEnv: { VERCEL: '1', VERCEL_ENV: 'development' },
    runEnv: { VERCEL: '1', VERCEL_ENV: 'development', VERCEL_REGION: 'dev1' },
  };

  const { systemEnvValues } = await getSystemEnvValues(
    output,
    client,
    projectId
  );
  for (const key of systemEnvValues) {
    systemEnvs.buildEnv[key] = '';
    systemEnvs.runEnv[key] = '';
  }

  return systemEnvs;
}
