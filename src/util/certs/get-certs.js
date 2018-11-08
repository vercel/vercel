// @flow
import { stringify } from 'querystring';
import { Output, Now } from '../types';
import type { Certificate } from '../types';

async function getCerts(output: Output, now: Now, domain?: string[]) {
  const query = domain ? stringify({ domain }) : '';
  const payload = await now.fetch(`/v3/now/certs?${query}`);
  const certs: Certificate[] = payload.certs;
  return certs;
}

export default getCerts;
