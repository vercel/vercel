import chalk from 'chalk';
import type Client from '../client';
import output from '../../output-manager';

export type CertificateChallenge = {
  type: 'dns-01';
  status: 'valid' | 'pending';
  authorization: string;
  domain: string;
  token: string;
  value: string;
  url: string;
};

export type CertificateOrder = {
  challengesToResolve: CertificateChallenge[];
  domains: string[];
  finalize: string;
  createdAt: number;
};

export default async function startCertOrder(
  client: Client,
  cns: string[],
  contextName: string
) {
  output.spinner(
    `Starting certificate issuance for ${chalk.bold(
      cns.join(', ')
    )} under ${chalk.bold(contextName)}`
  );
  const order = await client.fetch<CertificateOrder>('/v3/certs', {
    method: 'PATCH',
    body: {
      op: 'startOrder',
      domains: cns,
    },
  });
  return order;
}
