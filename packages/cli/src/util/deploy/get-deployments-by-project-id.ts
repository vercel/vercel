import { URLSearchParams } from 'url';
import type { Deployment } from '@vercel-internals/types';
import Client from '../client';

type LegacyDeployment = {
  aliasAssigned?: number | boolean | null;
  aliasError?: {
    code: string;
    message: string;
  } | null;
  buildingAt: number;
  checksConclusion?: 'succeeded' | 'failed' | 'skipped' | 'canceled';
  checksState?: 'registered' | 'running' | 'completed';
  created: number;
  createdAt?: number;
  creator: {
    uid: string;
    email?: string;
    username?: string;
    githubLogin?: string;
    gitlabLogin?: string;
  };
  inspectorUrl: string | null;
  isRollbackCandidate?: boolean | null;
  meta?: { [key: string]: string | undefined };
  name: string;
  ready?: number;
  source?: 'cli' | 'git' | 'import' | 'import/repo' | 'clone/repo';
  state:
    | 'BUILDING'
    | 'ERROR'
    | 'INITIALIZING'
    | 'QUEUED'
    | 'READY'
    | 'CANCELED';
  target?: 'production' | 'staging' | null;
  type: 'LAMBDAS';
  uid: string;
  url: string;
};

type Response = {
  deployments: LegacyDeployment[];
};

interface Options {
  from?: number | null;
  limit?: number | null;
  continue?: boolean;
  max?: number;
}

export default async function getDeploymentsByProjectId(
  client: Client,
  projectId: string,
  options: Options = { from: null, limit: 100, continue: false },
  total: number = 0
): Promise<Deployment[]> {
  const limit = options.limit || 100;

  const query = new URLSearchParams();
  query.set('projectId', projectId);
  query.set('limit', limit.toString());

  if (options.from) {
    query.set('from', options.from.toString());
  }

  const { deployments: legacyDeployments } = await client.fetch<Response>(
    `/v6/deployments?${query}`
  );

  // we need to transform the old deployment shape to the new shape
  const deployments: Deployment[] = legacyDeployments.map(depl => {
    return {
      aliasAssigned: depl.aliasAssigned,
      aliasError: depl.aliasError,
      buildingAt: depl.buildingAt,
      checksConclusion: depl.checksConclusion,
      checksState: depl.checksState,
      createdAt: depl.created,
      creator: {
        uid: depl.creator.uid,
        username: depl.creator.username,
      },
      id: depl.uid,
      inspectorUrl: depl.inspectorUrl,
      meta: depl.meta,
      name: depl.name,
      public: true,
      ready: depl.ready,
      readyState: depl.state,
      regions: [],
      source: depl.source,
      status: depl.state,
      target: depl.target,
      type: depl.type,
      url: depl.url,
      version: 2,
    };
  });

  total += deployments.length;

  if (options.max && total >= options.max) {
    return deployments;
  }

  if (options.continue && deployments.length === limit) {
    const nextFrom = deployments[deployments.length - 1].createdAt;
    const nextOptions = Object.assign({}, options, { from: nextFrom });
    deployments.push(
      ...(await getDeploymentsByProjectId(
        client,
        projectId,
        nextOptions,
        total
      ))
    );
  }

  return deployments;
}
