import type Client from '../client';
import { isAPIError, type APIError } from '../errors-ts';

export interface ProjectDomainVerification {
  type: string;
  domain: string;
  value: string;
  reason: string;
}

export interface ProjectDomain {
  name: string;
  apexName: string;
  projectId: string;
  redirect?: string | null;
  gitBranch?: string | null;
  verified: boolean;
  verification?: ProjectDomainVerification[];
}

export function getProjectDomain(
  client: Client,
  projectIdOrName: string,
  domainName: string
): Promise<ProjectDomain | APIError> {
  return fetchProjectDomain(
    client,
    `/v9/projects/${encodeURIComponent(projectIdOrName)}/domains/${encodeURIComponent(domainName)}`
  );
}

export function getProjectDomainByName(
  client: Client,
  domainName: string
): Promise<ProjectDomain | APIError> {
  return fetchProjectDomain(
    client,
    `/project-domains/${encodeURIComponent(domainName)}`
  );
}

export function verifyProjectDomain(
  client: Client,
  projectIdOrName: string,
  domainName: string
): Promise<ProjectDomain | APIError> {
  return fetchProjectDomain(
    client,
    `/v9/projects/${encodeURIComponent(projectIdOrName)}/domains/${encodeURIComponent(domainName)}/verify`,
    { method: 'POST' }
  );
}

async function fetchProjectDomain(
  client: Client,
  url: string,
  init?: { method: string }
): Promise<ProjectDomain | APIError> {
  try {
    return await client.fetch<ProjectDomain>(url, init);
  } catch (err: unknown) {
    if (isAPIError(err) && err.status < 500) {
      return err;
    }
    throw err;
  }
}
