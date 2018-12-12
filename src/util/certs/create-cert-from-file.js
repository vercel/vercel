import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DomainPermissionDenied } from '../errors-ts';
import { InvalidCert } from '../errors';
import wait from '../output/wait';

export default async function createCertFromFile(now, keyPath, certPath, caPath, context) {
  const cancelWait = wait('Adding your custom certificate');
  const cert = readFileSync(resolve(certPath), 'utf8');
  const key = readFileSync(resolve(keyPath), 'utf8');
  const ca = readFileSync(resolve(caPath), 'utf8');

  try {
    const certificate= await now.fetch('/v3/now/certs', {
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
    } if (error.code === 'forbidden') {
      return new DomainPermissionDenied(error.domain, context);
    }
    throw error;
  }
}
