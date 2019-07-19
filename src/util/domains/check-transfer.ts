import Client from '../client';

type Status =
  | 'pending_owner'
  | 'pending_admin'
  | 'pending_registry'
  | 'completed'
  | 'cancelled'
  | 'undef'
  | 'unknown';

type Response = {
  transferable: boolean;
  status: Status;
  reason: string;
  transferPolicy:
    | 'charge-and-renew'
    | 'not-supported'
    | 'no-change'
    | 'new-term'
    | null;
};

export default async function checkTransfer(client: Client, name: string) {
  return client.fetch<Response>(`/v4/domains/${name}/registry`);
}
