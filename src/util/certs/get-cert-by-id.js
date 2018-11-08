// @flow
import { Output, Now } from '../types';
import type { CertificateDetails } from '../types';

async function getCertById(output: Output, now: Now, id: string) {
  const cert: CertificateDetails = await now.fetch(`/v3/now/certs/${id}`);
  return cert;
}

export default getCertById;
