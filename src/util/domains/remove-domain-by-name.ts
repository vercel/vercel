import Client from '../client';

export default async function removeDomainByName(now: Client, domain: string) {
  return now.fetch(`/v3/domains/${domain}`, { method: 'DELETE' });
}
