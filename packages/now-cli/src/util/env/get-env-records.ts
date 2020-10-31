import { Output } from '../output';
import Client from '../client';
import {
  ProjectEnvVariable,
  ProjectEnvVariableV5,
  ProjectEnvTarget,
  PaginationOptions,
} from '../../types';
import { URLSearchParams } from 'url';

type ApiVersion = 4 | 5 | 6;

type APIV4Response = ProjectEnvVariableV5[];

interface APIV5Response {
  pagination: PaginationOptions;
  envs: ProjectEnvVariableV5[];
}

interface APIV6Response {
  envs: ProjectEnvVariable[];
}

export default async function getEnvVariables(
  output: Output,
  client: Client,
  projectId: string,
  apiVersion: 4,
  target?: ProjectEnvTarget
): Promise<APIV4Response>;

export default async function getEnvVariables(
  output: Output,
  client: Client,
  projectId: string,
  apiVersion: 5,
  target?: ProjectEnvTarget,
  next?: number
): Promise<APIV5Response>;

export default async function getEnvVariables(
  output: Output,
  client: Client,
  projectId: string,
  apiVersion: 6,
  target?: ProjectEnvTarget
): Promise<APIV6Response>;

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
  const query = new URLSearchParams();
  if (apiVersion === 5) {
    query.set('limit', String(20));
  }

  if (target) {
    query.set('target', target);
  }

  if (next) {
    query.set('until', String(next));
  }

  const url = `/v${apiVersion}/projects/${projectId}/env?${query}`;

  if (apiVersion === 6) {
    return client.fetch<APIV6Response>(url);
  } else if (apiVersion === 5) {
    return client.fetch<APIV5Response>(url);
  } else if (apiVersion === 4) {
    return client.fetch<APIV4Response>(url);
  } else {
    throw new Error('Unknown version: ' + apiVersion);
  }
}
