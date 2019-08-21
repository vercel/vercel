import chalk from 'chalk';
import wait from '../output/wait';
import Client from '../client';

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
  const cancelWait = wait(
    `Starting certificate issuance for ${chalk.bold(
      cns.join(', ')
    )} under ${chalk.bold(contextName)}`
  );
  try {
    const order = await client.fetch<CertificateOrder>('/v3/now/certs', {
      method: 'PATCH',
      body: {
        op: 'startOrder',
        domains: cns
      }
    });
    cancelWait();
    return order;
  } catch (error) {
    cancelWait();
    throw error;
  }
}
