import Client from '../client';
import mapCertError from '../certs/map-cert-error';

export default async function getDeploymentByUrl(client: Client, url: string) {
  try {
    return await client.fetch(url);
  } catch (error) {
    const mappedError = mapCertError(error);
    if (mappedError) {
      return mappedError;
    }
    throw error;
  }
}
