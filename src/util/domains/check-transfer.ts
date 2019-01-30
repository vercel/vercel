import Client from '../client';

type Response = {
  transferable: boolean;
  status: string;
  reason: string;
};

export default async function checkTransfer(client: Client, name: string) {
  return await client.fetch<Response>(`/v4/domains/${name}/registry`);
}
