import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';
import type { SdkKey, SdkKeysListResponse, CreateSdkKeyRequest } from './types';
import output from '../../output-manager';

export async function getSdkKeys(
  client: Client,
  projectId: string
): Promise<SdkKey[]> {
  output.debug(`Fetching SDK keys for project ${projectId}`);

  const url = `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/sdk-keys`;
  const response = await client.fetch<SdkKeysListResponse>(url);

  return response.data;
}

export async function createSdkKey(
  client: Client,
  projectId: string,
  request: CreateSdkKeyRequest
): Promise<SdkKey> {
  output.debug(`Creating SDK key for project ${projectId}`);

  const url = `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/sdk-keys`;
  const response = await client.fetch<SdkKey>(url, {
    method: 'PUT',
    body: request as unknown as JSONObject,
  });

  return response;
}

export async function deleteSdkKey(
  client: Client,
  projectId: string,
  hashKey: string
): Promise<void> {
  output.debug(`Deleting SDK key ${hashKey} for project ${projectId}`);

  const url = `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/sdk-keys/${encodeURIComponent(hashKey)}`;
  await client.fetch(url, {
    method: 'DELETE',
    json: false,
  });
}
