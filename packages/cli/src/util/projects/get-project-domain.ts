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

interface ProjectDomainFetchOptions {
  bailOn429?: boolean;
}

export function getProjectDomain(
  client: Client,
  projectIdOrName: string,
  domainName: string,
  options: ProjectDomainFetchOptions = {}
): Promise<ProjectDomain | APIError> {
  return fetchProjectDomain(
    client,
    `/v9/projects/${encodeURIComponent(projectIdOrName)}/domains/${encodeURIComponent(domainName)}`,
    options
  );
}

export function getProjectDomainByName(
  client: Client,
  domainName: string,
  options: ProjectDomainFetchOptions = {}
): Promise<ProjectDomain | APIError> {
  return fetchProjectDomain(
    client,
    `/project-domains/${encodeURIComponent(domainName)}`,
    options
  );
}

export function verifyProjectDomain(
  client: Client,
  projectIdOrName: string,
  domainName: string,
  options: ProjectDomainFetchOptions = {}
): Promise<ProjectDomain | APIError> {
  return fetchProjectDomain(
    client,
    `/v9/projects/${encodeURIComponent(projectIdOrName)}/domains/${encodeURIComponent(domainName)}/verify`,
    { ...options, method: 'POST' }
  );
}

async function fetchProjectDomain(
  client: Client,
  url: string,
  init?: ProjectDomainFetchOptions & { method?: string }
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
