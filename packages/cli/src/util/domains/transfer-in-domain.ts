import * as ERRORS from '../errors-ts';
import type Client from '../client';
import getScope from '../get-scope';
import { pollForOrder } from './get-order';

type TransferInResponse = {
  orderId: string;
};

export default async function transferInDomain(
  client: Client,
  name: string,
  authCode: string,
  expectedPrice: number,
  years: number
) {
  const { team } = await getScope(client);
  const teamParam = team ? `?teamId=${team.slug}` : '';

  try {
    const { orderId } = await client.fetch<TransferInResponse>(
      `/v1/registrar/domains/${name}/transfer${teamParam}`,
      {
        body: {
          authCode,
          autoRenew: true,
          years,
          expectedPrice,
          contactInformation: {
            firstName: 'Vercel',
            lastName: 'Whois',
            email: 'domains@registrar.vercel.com',
            phone: '+14153985463',
            address1: '100 First Street, Suite 2400',
            city: 'San Fransisco',
            state: 'CA',
            zip: '94105',
            country: 'US',
            companyName: 'Vercel Inc.',
          },
        },
        method: 'POST',
      }
    );

    const order = await pollForOrder(client, orderId);

    if (order === null) {
      // Timed out, something went wrong
      return new ERRORS.UnexpectedDomainTransferError(name);
    }

    if (order.status === 'completed') {
      const domain = order.domains.find(domain => domain.domainName === name);
      if (domain?.status === 'completed') {
        return { ok: true };
      }
    }

    if (order.error?.code === 'payment_failed') {
      return new ERRORS.DomainPaymentError();
    }

    return new ERRORS.UnexpectedDomainTransferError(name);
  } catch (err: unknown) {
    if (ERRORS.isAPIError(err)) {
      if (err.code === 'invalid_name') {
        return new ERRORS.InvalidDomain(name);
      }
      if (err.code === 'tld_not_supported') {
        return new ERRORS.UnsupportedTLD(name);
      }
      if (err.code === 'domain_not_available') {
        return new ERRORS.DomainNotAvailable(name);
      }
    }
    throw err;
  }
}
