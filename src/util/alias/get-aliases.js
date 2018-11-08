// @flow
import { Now } from '../types';
import type { Alias } from '../types';

async function getAliases(
  now: Now,
  deploymentId?: string
): Promise<Array<Alias>> {
  const payload = await now.fetch(
    deploymentId ? `/now/deployments/${deploymentId}/aliases` : '/now/aliases'
  );
  return payload.aliases || [];
}

export default getAliases;
