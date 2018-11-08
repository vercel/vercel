// @flow
import { Output, Now } from '../types';

async function removeDomainByName(output: Output, now: Now, domain: string) {
  return now.fetch(`/v3/domains/${domain}`, { method: 'DELETE' });
}

export default removeDomainByName;
