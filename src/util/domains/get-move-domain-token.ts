import * as ERRORS from '../errors-ts';
import Client from '../client';
import { Domain } from '../../types';

type Response = {
  domain: Domain & { moveToken: string };
};

export default async function getMoveDomainToken(
  client: Client,
  contextName: string,
  name: string,
  destination: string
) {
  try {
    return await client.fetch<Response>(
      `/v4/domains/${name}?moveTo=${destination}`
    );
  } catch (error) {
    if (error.code === 'domain_move_conflict') {
      const { suffix } = error;
      return new ERRORS.DomainMoveConflict({ domain: name, suffix });
    }
    if (error.code === 'not_found') {
      return new ERRORS.DomainNotFound(name);
    }
    if (error.code === 'forbidden') {
      return new ERRORS.DomainPermissionDenied(name, contextName);
    }
    if (error.code === 'invalid_move_destination') {
      return new ERRORS.InvalidMoveDestination(destination);
    }
    throw error;
  }
}
