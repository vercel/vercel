import * as ERRORS from '../errors-ts';
import Client from '../client';

type Response = {
  moved: boolean;
  token?: string;
};

export default async function moveOutDomain(
  client: Client,
  contextName: string,
  name: string,
  destination: string
) {
  try {
    return await client.fetch<Response>(`/v4/domains/${name}`, {
      body: { op: 'move-out', destination },
      method: 'PATCH'
    });
  } catch (error) {
    if (error.code === 'forbidden') {
      return new ERRORS.DomainPermissionDenied(name, contextName);
    }
    if (error.code === 'not_found') {
      return new ERRORS.DomainNotFound(name);
    }
    if (error.code === 'invalid_move_destination') {
      return new ERRORS.InvalidMoveDestination(destination);
    }
    if (error.code === 'domain_move_conflict') {
      const { pendingAsyncPurchase, resolvable, suffix, message } = error;
      return new ERRORS.DomainMoveConflict({
        message,
        pendingAsyncPurchase,
        resolvable,
        suffix
      });
    }
    throw error;
  }
}
