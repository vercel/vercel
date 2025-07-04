import type Client from '../client';
import chalk from 'chalk';

export async function vercelAuth(
  client: Client,
  {
    autoConfirm = false,
  }: {
    autoConfirm?: boolean;
  }
): Promise<'standard' | 'none'> {
  if (
    autoConfirm ||
    (await client.input.confirm(
      `Want to use the default Deployment Protection settings? ${chalk.dim(`(Vercel Authentication: Standard Protection)`)}`,
      true
    ))
  ) {
    return 'standard';
  }

  const vercelAuth = await client.input.select<'standard' | 'none'>({
    message: `What setting do you want to use for Vercel Authentication?`,
    default: 'standard',
    choices: [
      {
        description: 'Standard Protection (recommended)',
        name: 'standard',
        value: 'standard',
      },
      {
        description: 'No Protection (all deployments will be public)',
        name: 'none',
        value: 'none',
      },
    ],
  });

  return vercelAuth;
}
