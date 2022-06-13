import { Output } from '../output';
import Client from '../client';
import { ProjectEnvVariable, ProjectEnvTarget } from '../../types';
import { URLSearchParams } from 'url';

/** The CLI command that was used that needs the environment variables. */
export type EnvRecordsSource =
  | 'vercel-cli:env:ls'
  | 'vercel-cli:env:add'
  | 'vercel-cli:env:rm'
  | 'vercel-cli:env:pull'
  | 'vercel-cli:dev'
  | 'vercel-cli:pull';

export default async function getEnvRecords(
  output: Output,
  client: Client,
  projectId: string,
  source: EnvRecordsSource,
  {
    target,
    gitBranch,
    decrypt,
  }: {
    target?: ProjectEnvTarget | string;
    gitBranch?: string;
    decrypt?: boolean;
  } = {}
) {
  output.debug(
    `Fetching Environment Variables of project ${projectId} and target ${target}`
  );
  const query = new URLSearchParams();

  if (target) {
    query.set('target', target);
  }
  if (gitBranch) {
    query.set('gitBranch', gitBranch);
  }
  if (decrypt) {
    query.set('decrypt', decrypt.toString());
  }
  if (source) {
    query.set('source', source);
  }

  const url = `/v8/projects/${projectId}/env?${query}`;

  return client.fetch<{ envs: ProjectEnvVariable[] }>(url);
}
