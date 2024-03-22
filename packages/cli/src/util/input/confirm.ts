import type Client from '../client';

export default async function confirm(
  client: Client,
  message: string,
  preferred: boolean
): Promise<boolean> {
  require('./patch-inquirer');

  return client.confirm({
    message,
    default: preferred,
  });
}
