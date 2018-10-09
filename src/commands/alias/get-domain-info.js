// @flow
import wait from '../../util/output/wait';
import { DomainPermissionDenied } from '../../util/errors';
import { Now } from '../../util/types';

export type DomainInfo = {
  uid: string,
  creator: {
    email: string,
    uid: string,
    username: string
  },
  created: string,
  boughtAt?: string,
  expiresAt: string,
  isExternal: boolean,
  serviceType: string,
  verified: boolean,
  aliases: string[],
  certs: string[]
};

async function getDomainInfo(now: Now, domain: string, context: string) {
  const cancelMessage = wait(`Fetching domain info`);
  try {
    const info: DomainInfo = await now.fetch(`/domains/${domain}`);
    cancelMessage();
    return info;
  } catch (error) {
    cancelMessage();
    if (error.code === 'forbidden') {
      return new DomainPermissionDenied(domain, context);
    } else if (error.status === 404) {
      return null;
    } else {
      throw error;
    }
  }
}

export default getDomainInfo;
