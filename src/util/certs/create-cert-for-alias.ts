import * as ERRORS from '../errors-ts';
import createCertForCns from './create-cert-for-cns';
import getWildcardCnsForDomain from './get-wildcard-cns-for-domain';
import joinWords from '../output/join-words';
import stamp from '../output/stamp';
import wait from '../output/wait';
import { Output } from '../output';
import Client from '../client';

export default async function createCertificateForAlias(
  output: Output,
  client: Client,
  context: string,
  alias: string,
  shouldBeWildcard: boolean
) {
  const cns = shouldBeWildcard ? getWildcardCnsForDomain(alias) : [alias];
  const cancelMessage = wait(`Generating a certificate...`);
  const certStamp = stamp();
  const cert = await createCertForCns(client, cns, context);
  if (
    cert instanceof ERRORS.DomainConfigurationError ||
    cert instanceof ERRORS.DomainPermissionDenied ||
    cert instanceof ERRORS.TooManyCertificates ||
    cert instanceof ERRORS.TooManyRequests ||
    cert instanceof ERRORS.DomainValidationRunning ||
    cert instanceof ERRORS.DomainsShouldShareRoot ||
    cert instanceof ERRORS.CantSolveChallenge
  ) {
    cancelMessage();
    return cert;
  }

  cancelMessage();
  output.log(`Certificate for ${joinWords(cert.cns)} (${cert.uid}) created ${certStamp()}`);
  return cert;
}
