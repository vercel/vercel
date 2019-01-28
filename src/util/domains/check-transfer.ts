import Client from '../client';

type Response = {
  transferrable: boolean;
  status: string;
  reason: string;
};

export default async function checkTransfer(client: Client, name: string) {
  return await client.fetch<Response>(`/v4/domains/${name}/transfer`);
}
