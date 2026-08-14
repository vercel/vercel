import type Client from '../client';
import { isAPIError, type APIError } from '../errors-ts';

export interface DomainConfigConflict {
  name: string;
  type: 'A' | 'AAAA' | 'CAA';
  value: string;
}

export interface DomainConfigV6 {
  configuredBy: null | 'CNAME' | 'A' | 'http' | 'dns-01';
  misconfigured: boolean;
  serviceType: 'zeit.world' | 'external' | 'na';
  nameservers: string[];
  cnames: string[];
  aValues: string[];
  dnssecEnabled?: boolean;
  conflicts?: DomainConfigConflict[];
  acceptedChallenges?: Array<'http-01' | 'dns-01'>;
  recommendedIPv4?: Array<{ rank: number; value: string[] }>;
  recommendedCNAME?: Array<{ rank: number; value: string }>;
  ipStatus?: 'optional-change' | 'required-change' | 'no-change' | null;
}

export async function getDomainConfigV6(
  client: Client,
  domainName: string,
  options: {
    projectIdOrName?: string;
    strict?: boolean;
    bailOn429?: boolean;
  } = {}
): Promise<DomainConfigV6 | APIError> {
  const query = new URLSearchParams();
  if (options.projectIdOrName) {
    query.set('projectIdOrName', options.projectIdOrName);
  }
  if (options.strict) {
    query.set('strict', 'true');
  }
  const queryString = query.toString();

  try {
    return await client.fetch<DomainConfigV6>(
      `/v6/domains/${encodeURIComponent(domainName)}/config${
        queryString ? `?${queryString}` : ''
      }`,
      { bailOn429: options.bailOn429 }
    );
  } catch (err: unknown) {
    if (isAPIError(err) && err.status < 500) {
      return err;
    }
    throw err;
  }
}
