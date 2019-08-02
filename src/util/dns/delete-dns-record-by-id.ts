import Client from '../client';

export default async function deleteDNSRecordById(
  client: Client,
  domain: string,
  recordId: string
) {
  return client.fetch(
    `/v3/domains/${encodeURIComponent(domain)}/records/${recordId}`,
    {
      method: 'DELETE'
    }
  );
}
