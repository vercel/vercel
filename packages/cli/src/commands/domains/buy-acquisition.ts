import { parse } from 'tldts';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import getDomainPrice from '../../util/domains/get-domain-price';
import getDomainStatus from '../../util/domains/get-domain-status';
import { isAPIError, UnsupportedTLD } from '../../util/errors-ts';

/**
 * Everything the purchase plan needs to know about the domain, gathered
 * before any prompt or mutation. Safe to fetch in every output mode:
 * availability and price lookups are read-only.
 */
export interface PurchaseFacts {
  domainName: string;
  contextName: string;
  teamSlug: string | undefined;
  available: boolean;
  purchasePrice: number | null;
  renewalPrice: number | null;
  years: number;
}

export type PurchaseAcquisitionErrorKind =
  | 'invalid-domain'
  | 'tld-not-supported'
  | 'api-error';

export interface PurchaseAcquisitionError {
  kind: PurchaseAcquisitionErrorKind;
  code: string;
  message: string;
}

export type PurchaseAcquisitionResult =
  | { ok: true; facts: PurchaseFacts }
  | { ok: false; error: PurchaseAcquisitionError };

export async function acquirePurchaseFacts(
  client: Client,
  domainName: string
): Promise<PurchaseAcquisitionResult> {
  const parsedDomain = parse(domainName);
  const { domain: rootDomain, subdomain } = parsedDomain;
  if (subdomain || !rootDomain) {
    return {
      ok: false,
      error: {
        kind: 'invalid-domain',
        code: 'invalid_domain',
        message: `"${domainName}" is not a registrable domain. Use a root domain without a subdomain${
          rootDomain ? ` (for example ${rootDomain})` : ''
        }.`,
      },
    };
  }

  const { contextName, team } = await getScope(client);

  const [price, status] = await Promise.all([
    getDomainPrice(client, domainName, { bailOn429: true }),
    getDomainStatus(client, domainName, { bailOn429: true }).catch(
      (err: unknown) => (err instanceof Error ? err : new Error(String(err)))
    ),
  ]);

  if (price instanceof UnsupportedTLD) {
    return {
      ok: false,
      error: {
        kind: 'tld-not-supported',
        code: 'tld_not_supported',
        message: `The TLD for ${domainName} is not supported for purchase through Vercel.`,
      },
    };
  }
  if (price instanceof Error) {
    return { ok: false, error: apiError(price) };
  }
  if (status instanceof Error) {
    return { ok: false, error: apiError(status) };
  }

  return {
    ok: true,
    facts: {
      domainName,
      contextName,
      teamSlug: team?.slug,
      available: status.available,
      purchasePrice: price.purchasePrice,
      renewalPrice: price.renewalPrice,
      years: price.years,
    },
  };
}

function apiError(err: Error): PurchaseAcquisitionError {
  if (isAPIError(err)) {
    return {
      kind: 'api-error',
      code: err.code || 'api_error',
      message: err.serverMessage || `API error (${err.status})`,
    };
  }
  return {
    kind: 'api-error',
    code: 'api_error',
    message: err.message,
  };
}
