import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DomainPermissionDenied, InvalidCert } from '../errors-ts';
import wait from '../output/wait';
import Client from '../client';
import { Cert } from '../../types';

export default async function createCertFromFile(
  client: Client,
  keyPath: string,
  certPath: string,
  caPath: string,
  context: string
) {
  const cancelWait = wait('Adding your custom certificate');
  const cert = readFileSync(resolve(certPath), 'utf8');
  const key = readFileSync(resolve(keyPath), 'utf8');
  const ca = readFileSync(resolve(caPath), 'utf8');

  try {
    const certificate = await client.fetch<Cert>('/v3/now/certs', {
      method: 'PUT',
      body: {
        ca,
        cert,
        key
      }
    });
    cancelWait();
    return certificate;
  } catch (error) {
    cancelWait();
    if (error.code === 'invalid_cert') {
      return new InvalidCert();
    }
    if (error.code === 'forbidden') {
      return new DomainPermissionDenied(error.domain, context);
    }
    throw error;
  }
}
