import { bold } from 'chalk';
import type { LoginResult, SAMLError } from './types';
import type Client from '../client';
import output from '../../output-manager';
import { performDeviceCodeFlow } from '../../commands/login/future';

export default async function reauthenticate(
  client: Client,
  error: Pick<SAMLError, 'enforced' | 'scope' | 'teamId'>
): Promise<LoginResult> {
  // The device code flow opens a browser and polls for human approval, so it
  // cannot succeed when the caller supplied an explicit token (we should
  // respect their choice and not silently swap it out) or when there is no
  // interactive TTY available (e.g. CI). Bail early with an actionable error
  // instead of hanging for the full request timeout.
  const { tokenSource } = client.authConfig;
  const reauthAction = error.enforced
    ? 'SAML re-authentication is required'
    : 'Re-authentication is required';

  if (tokenSource === 'flag') {
    throw new Error(
      `${reauthAction} for ${bold(error.scope)} scope, but the token provided via \`--token\` does not have access. ` +
        `Provide a token that is authorized for that scope.`
    );
  }

  if (tokenSource === 'env') {
    throw new Error(
      `${reauthAction} for ${bold(error.scope)} scope, but the token provided via the VERCEL_TOKEN environment variable does not have access. ` +
        `Set VERCEL_TOKEN to a token that is authorized for that scope.`
    );
  }

  if (!client.stdin.isTTY) {
    throw new Error(
      `${reauthAction} for ${bold(error.scope)} scope, but the current environment is non-interactive so the device-code flow cannot be completed. ` +
        `Run \`vercel login\` in an interactive shell, or set VERCEL_TOKEN / pass \`--token\` with a token that is authorized for that scope.`
    );
  }

  if (error.teamId && error.enforced) {
    output.log(
      `You must re-authenticate with SAML to use ${bold(error.scope)} scope.`
    );
  } else {
    output.log(`You must re-authenticate to use ${bold(error.scope)} scope.`);
  }

  // Use the device code flow for all re-authentication cases.
  // When the team has a missing scope (SAML, MFA, etc.), pass the
  // team ID so the device flow page can enforce the required
  // authorization before granting the token.
  const tokens = await performDeviceCodeFlow(client, {
    teamId: error.teamId || undefined,
  });

  if (!tokens) {
    return 1;
  }

  client.updateAuthConfig({
    token: tokens.access_token,
    userId: undefined,
    expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    refreshToken: tokens.refresh_token,
  });

  client.persistAuthConfig();

  output.success(`Authentication complete for ${bold(error.scope)} scope.`);

  return { token: tokens.access_token, email: '' };
}
