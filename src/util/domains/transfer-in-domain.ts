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
      method: 'POST'
    });
  } catch (error) {
    if (error.code === 'invalid_name') {
      return new ERRORS.InvalidDomain(name);
    }
    if (error.code === 'domain_already_exists') {
      return new ERRORS.DomainNotAvailable(name);
    }
    if (error.code === 'not_transferable') {
      return new ERRORS.DomainNotTransferable(name);
    }
    if (error.code === 'invalid_auth_code') {
      return new ERRORS.InvalidTransferAuthCode(name, authCode);
    }
    if (error.code === 'source_not_found') {
      return new ERRORS.SourceNotFound();
    }
    if (error.code === 'registration_failed') {
      return new ERRORS.DomainRegistrationFailed(name, error.message);
    }
    throw error;
  }
}
