import { Output } from '../output';
import Client from '../client';
import {
  ProjectEnvVariable,
  ProjectEnvTarget,
  PaginationOptions,
} from '../../types';

type ApiVersion = 4 | 5;

type APIV4Response = ProjectEnvVariable[];

interface APIV5Response {
  pagination: PaginationOptions;
  envs: ProjectEnvVariable[];
}

export default async function getEnvVariables(
  output: Output,
  client: Client,
  projectId: string,
  apiVersion: 4,
  target?: ProjectEnvTarget,
  next?: number
): Promise<APIV4Response>;

export default async function getEnvVariables(
  output: Output,
  client: Client,
  projectId: string,
  apiVersion: 5,
  target?: ProjectEnvTarget,
  next?: number
): Promise<APIV5Response>;

export default async function getEnvVariables<V extends ApiVersion>(
  output: Output,
  client: Client,
  projectId: string,
  apiVersion: V,
  target?: ProjectEnvTarget,
  next?: number
) {
  output.debug(
    `Fetching Environment Variables of project ${projectId} and target ${target}`
  );
  const qs = target ? `?target=${encodeURIComponent(target)}` : '';
  const limit = apiVersion >= 5 ? '?limit=20' : '';
  let url = `/v${apiVersion}/projects/${projectId}/env${qs}${limit}`;

  if (next) {
    url += `&until=${next}`;
  }

  if (apiVersion === 5) {
    return client.fetch<APIV5Response>(url);
  } else if (apiVersion === 4) {
    return client.fetch<APIV4Response>(url);
  } else {
    throw new Error('Unknown version: ' + apiVersion);
  }
}
