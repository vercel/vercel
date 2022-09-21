import chalk from 'chalk';
import type Client from '../client';

export interface CertificateChallenge {
  type: 'dns-01';
  status: 'valid' | 'pending';
  authorization: string;
  domain: string;
  token: string;
  value: string;
  url: string;
}

export interface CertificateOrder {
  challengesToResolve: CertificateChallenge[];
  domains: string[];
  finalize: string;
  createdAt: number;
}

export default async function startCertOrder(
  client: Client,
  cns: string[],
  contextName: string,
) {
  client.output.spinner(
    `Starting certificate issuance for ${chalk.bold(
      cns.join(', '),
    )} under ${chalk.bold(contextName)}`,
  );
  const order = await client.fetch<CertificateOrder>('/v3/now/certs', {
    method: 'PATCH',
    body: {
      op: 'startOrder',
      domains: cns,
    },
  });
  return order;
}
