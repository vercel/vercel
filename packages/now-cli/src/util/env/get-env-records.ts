import { Output } from '../output';
import Client from '../client';
import {
  ProjectEnvVariable,
  ProjectEnvTarget,
  PaginationOptions,
} from '../../types';

export type APIV5Response = {
  envs: ProjectEnvVariable[];
  pagination?: PaginationOptions;
};

export type APIV4Response = ProjectEnvVariable[];

export default async function getEnvVariables(
  output: Output,
  client: Client,
  projectId: string,
  target?: ProjectEnvTarget,
  next?: number,
  apiVersion: number = 4
) {
  output.debug(
    `Fetching Environment Variables of project ${projectId} and target ${target}`
  );
  const qs = target ? `?target=${encodeURIComponent(target)}` : '';
  let limit = apiVersion >= 5 ? '?limit=20' : '';
  let url = `/v${apiVersion}/projects/${projectId}/env${qs}${limit}`;

  if (next) {
    url += `&until=${next}`;
  }

  const data = await client.fetch<APIV4Response | APIV5Response>(url);

  if (apiVersion >= 5) {
    const { envs, pagination } = data as APIV5Response;
    return { envs, pagination };
  }
  return data;
}
