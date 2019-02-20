import { Domain } from 'domain';
import * as ERRORS from '../errors-ts';
import Client from '../client';

type Response = {
  domain: Domain;
};

export default async function moveDomain(
  client: Client,
  name: string,
  token: string
) {
  try {
    return await client.fetch<Response>(`/v4/domains/${name}/move`, {
      body: { token },
      method: 'POST'
    });
  } catch (error) {
    if (error.code === 'not_found') {
      return new ERRORS.DomainNotFound(name);
    }
    if (error.code === 'invalid_move_token') {
      return new ERRORS.InvalidMoveToken(token);
    }
    throw error;
  }
}
