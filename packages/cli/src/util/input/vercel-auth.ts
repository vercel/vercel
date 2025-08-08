import type Client from '../client';
import chalk from 'chalk';

export type VercelAuthSetting = 'standard' | 'none';
export const DEFAULT_VERCEL_AUTH_SETTING: VercelAuthSetting = 'standard';

const OPTIONS = {
  message: `What setting do you want to use for Vercel Authentication?`,
  default: DEFAULT_VERCEL_AUTH_SETTING,
  choices: [
    {
      description: 'Standard Protection (recommended)',
      name: 'standard',
      value: 'standard' as VercelAuthSetting,
    },
    {
      description: 'No Protection (all deployments will be public)',
      name: 'none',
      value: 'none' as VercelAuthSetting,
    },
  ],
};

export async function vercelAuth(
  client: Client,
  {
    autoConfirm = false,
  }: {
    autoConfirm?: boolean;
  }
): Promise<VercelAuthSetting> {
  if (
    autoConfirm ||
    (await client.input.confirm(
      `Want to use the default Deployment Protection settings? ${chalk.dim(`(Vercel Authentication: Standard Protection)`)}`,
      true
    ))
  ) {
    return DEFAULT_VERCEL_AUTH_SETTING;
  }

  const vercelAuth = await client.input.select<VercelAuthSetting>(OPTIONS);

  return vercelAuth;
}
