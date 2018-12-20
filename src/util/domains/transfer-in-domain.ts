import * as ERRORS from '../errors-ts';
import Client from '../client';

type Response = {
  created: number;
  ns: string[];
  uid: string;
  verified: boolean;
};

export default async function transferInDomain(
  client: Client,
  name: string,
  authCode: string
) {
  try {
    return await client.fetch<Response>(`/v3/domains/transfer-in`, {
      body: { name, authCode },
      method: 'POST',
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
    throw error;
  }
}
