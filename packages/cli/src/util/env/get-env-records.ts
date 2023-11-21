import { Output } from '../output/index.js';
import Client from '../client.js';
import type {
  ProjectEnvVariable,
  ProjectEnvTarget,
} from '@vercel-internals/types';
import { URLSearchParams } from 'node:url';

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

interface PullEnvOptions {
  target?: ProjectEnvTarget | string;
  gitBranch?: string;
}

export async function pullEnvRecords(
  output: Output,
  client: Client,
  projectId: string,
  source: EnvRecordsSource,
  { target, gitBranch }: PullEnvOptions = {}
) {
  output.debug(
    `Fetching Environment Variables of project ${projectId} and target ${target}`
  );
  const query = new URLSearchParams();

  let url = `/v1/env/pull/${projectId}`;

  if (target) {
    url += `/${encodeURIComponent(target)}`;
    if (gitBranch) {
      url += `/${encodeURIComponent(gitBranch)}`;
    }
  }

  if (source) {
    query.set('source', source);
  }

  if (Array.from(query).length > 0) {
    url += `?${query}`;
  }

  return client.fetch<{
    env: Record<string, string>;
    buildEnv: Record<string, string>;
  }>(url);
}
