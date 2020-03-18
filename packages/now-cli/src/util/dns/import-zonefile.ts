import chalk from 'chalk';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Response } from 'node-fetch';
import { DomainNotFound, InvalidDomain } from '../errors-ts';
import Client from '../client';
import wait from '../output/wait';

type JSONResponse = {
  recordIds: string[];
};

export default async function importZonefile(
  client: Client,
  contextName: string,
  domain: string,
  zonefilePath: string
) {
  const cancelWait = wait(
    `Importing Zone file for domain ${domain} under ${chalk.bold(contextName)}`
  );
  const zonefile = readFileSync(resolve(zonefilePath), 'utf8');

  try {
    const res = await client.fetch<Response>(`/v3/domains/${domain}/records`, {
      headers: { 'Content-Type': 'text/dns' },
      body: zonefile,
      method: 'PUT',
      json: false,
    });

    const { recordIds } = (await res.json()) as JSONResponse;
    cancelWait();
    return recordIds;
  } catch (error) {
    cancelWait();
    if (error.code === 'not_found') {
      return new DomainNotFound(domain);
    }

    if (error.code === 'invalid_domain') {
      return new InvalidDomain(domain);
    }

    throw error;
  }
}
