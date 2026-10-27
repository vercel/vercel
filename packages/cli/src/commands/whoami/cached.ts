import type { AuthConfig } from '@vercel-internals/types';
import { getCachedUsername } from '../../util/get-user';

/**
 * The saved username `vercel whoami --cached` prints without a request, or
 * undefined when that run has to ask Vercel. The entry point also uses it to
 * skip scope resolution, which the username doesn't depend on.
 */
export function getWhoamiCachedAnswer(
  args: readonly string[],
  authConfig: AuthConfig
): string | undefined {
  return args.includes('--cached') ? getCachedUsername(authConfig) : undefined;
}
