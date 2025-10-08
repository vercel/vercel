import { URLSearchParams } from 'url';
import type Client from '../client';
import type { ProjectEnvVariable } from '@vercel-internals/types';
import output from '../../output-manager';

/** The CLI command that was used that needs the environment variables. */
export type EnvRecordsSource =
  | 'vercel-cli:env:ls'
  | 'vercel-cli:env:add'
  | 'vercel-cli:env:rm'
  | 'vercel-cli:env:update'
  | 'vercel-cli:env:pull'
  | 'vercel-cli:dev'
  | 'vercel-cli:pull';

export default async function getEnvRecords(
  client: Client,
  projectId: string,
  source: EnvRecordsSource,
  {
    target,
    gitBranch,
    decrypt,
  }: {
    target?: string;
    gitBranch?: string;
    decrypt?: boolean;
  } = {}
) {
  output.debug(
    `Fetching Environment Variables of project ${projectId} and target ${target}`
  );
  const query = new URLSearchParams();

  if (target) {
    let targetParam = 'target';
    if (
      target !== 'production' &&
      target !== 'preview' &&
      target !== 'development'
    ) {
      targetParam = 'customEnvironmentId';
    }
    query.set(targetParam, target);
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

  const url = `/v10/projects/${projectId}/env?${query}`;

  return client.fetch<{ envs: ProjectEnvVariable[] }>(url);
}

interface PullEnvOptions {
  target?: string;
  gitBranch?: string;
}

export async function pullEnvRecords(
  client: Client,
  projectId: string,
  source: EnvRecordsSource,
  { target, gitBranch }: PullEnvOptions = {}
) {
  output.debug(
    `Fetching Environment Variables of project ${projectId} and target ${target}`
  );
  const query = new URLSearchParams();

  let url = `/v3/env/pull/${projectId}`;

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
