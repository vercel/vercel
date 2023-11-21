import { NowError } from '../now-error.js';
import { Output } from '../output/index.js';
import Client from '../client.js';
import createCertForCns from './create-cert-for-cns.js';
import getWildcardCnsForAlias from './get-wildcard-cns-for-alias.js';
import joinWords from '../output/join-words.js';
import stamp from '../output/stamp.js';

export default async function createCertificateForAlias(
  output: Output,
  client: Client,
  context: string,
  alias: string,
  shouldBeWildcard: boolean
) {
  output.spinner(`Generating a certificate…`);
  const cns = shouldBeWildcard ? getWildcardCnsForAlias(alias) : [alias];
  const certStamp = stamp();
  const cert = await createCertForCns(client, cns, context);

  if (cert instanceof NowError) {
    output.stopSpinner();
    return cert;
  }

  output.log(
    `Certificate for ${joinWords(cert.cns)} (${
      cert.uid
    }) created ${certStamp()}`
  );

  return cert;
}
