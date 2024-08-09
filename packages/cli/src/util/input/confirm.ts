import type Client from '../client';

export default async function confirm(
  client: Client,
  message: string,
  preferred: boolean
): Promise<boolean> {
  return client.input.confirm({
    message,
    default: preferred,
  });
}
