import { readFileSync } from 'fs';
import { resolve } from 'path';
import wait from '../output/wait';
import Client from '../client';
import { Cert } from '../../types';

export default async function createCertFromFile(
  client: Client,
  keyPath: string,
  certPath: string,
  caPath: string
) {
  const cancelWait = wait('Adding your custom certificate');

  try {
    const cert = readFileSync(resolve(certPath), 'utf8');
    const key = readFileSync(resolve(keyPath), 'utf8');
    const ca = readFileSync(resolve(caPath), 'utf8');

    const certificate = await client.fetch<Cert>('/v3/now/certs', {
      method: 'PUT',
      body: {
        ca,
        cert,
        key,
      },
    });
    return certificate;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return new Error(`The specified file "${error.path}" doesn't exist.`);
    }

    if (error.status < 500) {
      return error;
    }

    throw error;
  } finally {
    cancelWait();
  }
}
