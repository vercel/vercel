import * as ERRORS from '../errors-ts';
import Client from '../client';
import { Domain } from '../../types';

type Response = {
  domain: Domain;
};

export default async function transferInDomain(
  client: Client,
  name: string,
  authCode: string,
  expectedPrice: number
) {
  try {
    return await client.fetch<Response>(`/v4/domains`, {
      body: { method: 'transfer-in', name, authCode, expectedPrice },
      method: 'POST',
    });
  } catch (err: unknown) {
    if (ERRORS.isAPIError(err)) {
      if (err.code === 'invalid_name') {
        return new ERRORS.InvalidDomain(name);
      }
      if (err.code === 'domain_already_exists') {
        return new ERRORS.DomainNotAvailable(name);
      }
      if (err.code === 'not_transferable') {
        return new ERRORS.DomainNotTransferable(name);
      }
      if (err.code === 'invalid_auth_code') {
        return new ERRORS.InvalidTransferAuthCode(name, authCode);
      }
      if (err.code === 'source_not_found') {
        return new ERRORS.SourceNotFound();
      }
      if (err.code === 'registration_failed') {
        return new ERRORS.DomainRegistrationFailed(name, err.message);
      }
    }
    throw err;
  }
}
