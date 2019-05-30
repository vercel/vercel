import * as ERRORS from '../errors-ts';
import Client from '../client';

type Response = {
  created: number;
  ns: string[];
  uid: string;
  pending: boolean;
  verified: boolean;
};

export default async function purchaseDomain(
  client: Client,
  name: string,
  expectedPrice: number
) {
  try {
    return await client.fetch<Response>(`/v3/domains/buy`, {
      body: { name, expectedPrice },
      method: 'POST'
    });
  } catch (error) {
    if (error.code === 'invalid_domain') {
      return new ERRORS.InvalidDomain(name);
    }
    if (error.code === 'not_available') {
      return new ERRORS.DomainNotAvailable(name);
    }
    if (error.code === 'service_unavailabe') {
      return new ERRORS.DomainServiceNotAvailable(name);
    }
    if (error.code === 'unexpected_error') {
      return new ERRORS.UnexpectedDomainPurchaseError(name);
    }
    if (error.code === 'source_not_found') {
      return new ERRORS.SourceNotFound();
    }
    if (error.code === 'payment_error') {
      return new ERRORS.DomainPaymentError();
    }
    if (error.code === 'unsupported_tld') {
      return new ERRORS.UnsupportedTLD(name);
    }
    throw error;
  }
}
