import type Client from '../client';
import type {
  FlagsProjectConnection,
  FlagsProjectConnectionRole,
  FlagsProjectConnectionsListResponse,
} from './types';
import output from '../../output-manager';

function connectionsUrl(projectId: string): string {
  return `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/connections`;
}

export async function getConnections(
  client: Client,
  projectId: string,
  role: FlagsProjectConnectionRole
): Promise<FlagsProjectConnection[]> {
  output.debug(
    `Fetching flags connections for project ${projectId} as ${role}`
  );

  const response = await client.fetch<FlagsProjectConnectionsListResponse>(
    `${connectionsUrl(projectId)}?role=${role}`
  );

  return response.data;
}

export async function createConnection(
  client: Client,
  sourceProjectId: string,
  consumerProjectId: string
): Promise<FlagsProjectConnection> {
  output.debug(
    `Connecting project ${consumerProjectId} to the flags of project ${sourceProjectId}`
  );

  return client.fetch<FlagsProjectConnection>(connectionsUrl(sourceProjectId), {
    method: 'PUT',
    body: { consumerProjectId },
  });
}

export async function deleteConnection(
  client: Client,
  sourceProjectId: string,
  consumerProjectId: string
): Promise<void> {
  output.debug(
    `Disconnecting project ${consumerProjectId} from the flags of project ${sourceProjectId}`
  );

  await client.fetch(
    `${connectionsUrl(sourceProjectId)}/${encodeURIComponent(consumerProjectId)}`,
    { method: 'DELETE', json: false }
  );
}
