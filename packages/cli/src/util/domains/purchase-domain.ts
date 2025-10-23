import * as ERRORS from '../errors-ts';
import type Client from '../client';
import { pollForOrder } from './get-order';
import { getDomain } from './get-domain';
import getScope from '../get-scope';
import type { ContactInformation } from './collect-contact-information';

type OrderResponse = {
  orderId: string;
};

export default async function purchaseDomain(
  client: Client,
  name: string,
  expectedPrice: number,
  years: number,
  autoRenew: boolean = true,
  contactInformation: ContactInformation
) {
  const { team, contextName } = await getScope(client);
  const teamParam = team ? `?teamId=${team.slug}` : '';

  try {
    const { orderId } = await client.fetch<OrderResponse>(
      `/v1/registrar/domains/${name}/buy${teamParam}`,
      {
        body: {
          expectedPrice,
          autoRenew,
          years,
          contactInformation,
        },
        method: 'POST',
      }
    );

    const order = await pollForOrder(client, orderId);

    if (order === null) {
      // Timed out, something went wrong
      return new ERRORS.UnexpectedDomainPurchaseError(name);
    }

    if (order.status === 'completed') {
      const domain = order.domains.find(domain => domain.domainName === name);
      if (domain?.status === 'completed') {
        const domain = await getDomain(client, contextName, name);
        if (domain instanceof ERRORS.APIError) {
          throw domain;
        }
        return domain;
      }
    }

    if (order.error?.code === 'payment_failed') {
      return new ERRORS.DomainPaymentError();
    }

    return new ERRORS.UnexpectedDomainPurchaseError(name);
  } catch (err: unknown) {
    if (ERRORS.isAPIError(err)) {
      if (err.code === 'invalid_domain') {
        return new ERRORS.InvalidDomain(name);
      }
      if (err.code === 'domain_not_available') {
        return new ERRORS.DomainNotAvailable(name);
      }
      if (err.code === 'internal_server_error') {
        return new ERRORS.UnexpectedDomainPurchaseError(name);
      }
      if (err.code === 'tld_not_supported') {
        return new ERRORS.UnsupportedTLD(name);
      }
      if (err.code === 'additional_contact_info_required') {
        return new ERRORS.TLDNotSupportedViaCLI(name);
      }
    }
    throw err;
  }
}
