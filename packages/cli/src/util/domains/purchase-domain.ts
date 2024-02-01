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
  expectedPrice: number,
  renew: boolean = true
) {
  try {
    return await client.fetch<Response>(`/v3/domains/buy`, {
      body: { name, expectedPrice, renew },
      method: 'POST',
    });
  } catch (err: unknown) {
    if (ERRORS.isAPIError(err)) {
      if (err.code === 'invalid_domain') {
        return new ERRORS.InvalidDomain(name);
      }
      if (err.code === 'not_available') {
        return new ERRORS.DomainNotAvailable(name);
      }
      if (err.code === 'service_unavailabe') {
        return new ERRORS.DomainServiceNotAvailable(name);
      }
      if (err.code === 'unexpected_error') {
        return new ERRORS.UnexpectedDomainPurchaseError(name);
      }
      if (err.code === 'source_not_found') {
        return new ERRORS.SourceNotFound();
      }
      if (err.code === 'payment_error') {
        return new ERRORS.DomainPaymentError();
      }
      if (err.code === 'unsupported_tld') {
        return new ERRORS.UnsupportedTLD(name);
      }
    }
    throw err;
  }
}
