import { hostname } from 'node:os';
import ua from './ua';
import { OAuth, isOAuthError } from '@vercel/cli-auth/oauth';

const VERCEL_ISSUER = new URL('https://vercel.com');
export const VERCEL_CLI_CLIENT_ID = 'cl_HYyOPBNtFMfHhaUn9L4QPfTZz6TP47bp';
export const userAgent = `${hostname()} @ ${ua}`;

export { isOAuthError };

export const oauth = OAuth({
  clientId: VERCEL_CLI_CLIENT_ID,
  issuer: VERCEL_ISSUER,
  userAgent: `${hostname()} @ ${ua}`,
});
