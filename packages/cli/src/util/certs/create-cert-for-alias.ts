import { NowError } from '../now-error';
import { Output } from '../output';
import Client from '../client';
import createCertForCns from './create-cert-for-cns';
import getWildcardCnsForAlias from './get-wildcard-cns-for-alias';
import joinWords from '../output/join-words';
import stamp from '../output/stamp';

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
