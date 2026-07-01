import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { validateJsonOutput } from '../../util/output-format';
import { sanitizeForTerminal } from '../../util/connex/sanitize';
import { selectConnexTeam } from '../../util/connex/select-team';
import type { ConnexClientIdentity } from './types';

interface RevokeTokensResult {
  tokensFound: number;
  deleted: number;
  providerRevoked: number;
  providerSkipped: number;
  providerFailed: number;
}

export async function revokeTokens(
  client: Client,
  args: string[],
  flags: {
    '--my-tokens'?: boolean;
    '--all-tokens'?: boolean;
    '--yes'?: boolean;
    '--format'?: string;
    '--json'?: boolean;
  }
): Promise<number> {
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  if (asJson && !flags['--yes']) {
    output.error('--format=json requires --yes to skip confirmation prompts');
    return 1;
  }

  const clientIdOrUid = args[0];
  if (!clientIdOrUid) {
    output.error(
      'Missing connector ID or UID. Usage: vercel connect revoke-tokens <connector>'
    );
    return 1;
  }

  const myTokens = !!flags['--my-tokens'];
  const allTokens = !!flags['--all-tokens'];

  if (myTokens && allTokens) {
    output.error('--my-tokens and --all-tokens are mutually exclusive.');
    return 1;
  }

  if (flags['--yes'] && !myTokens && !allTokens) {
    output.error(
      '--yes requires a scope flag. Use --yes --my-tokens or --yes --all-tokens.'
    );
    return 1;
  }

  await selectConnexTeam(client, 'Select the team for this connector');

  output.spinner('Retrieving connector…');
  let target: ConnexClientIdentity;
  try {
    target = await client.fetch<ConnexClientIdentity>(
      `/v1/connect/connectors/${encodeURIComponent(clientIdOrUid)}`
    );
  } catch (err: unknown) {
    output.stopSpinner();
    const status = (err as { status?: number }).status;
    if (status === 404) {
      output.error(`No connector found for ${chalk.bold(clientIdOrUid)}.`);
      return 1;
    }
    output.error(
      `Failed to look up ${chalk.bold(clientIdOrUid)}: ${(err as Error).message}`
    );
    return 1;
  }
  output.stopSpinner();

  const displayName = sanitizeForTerminal(
    target.name || target.uid || target.id
  );
  const supportsRevocation = target.supportsRevocation !== false;

  // Resolve subjectScope: flag → interactive TTY → error
  let subjectScope: 'mine' | 'all';
  if (myTokens) {
    subjectScope = 'mine';
  } else if (allTokens) {
    subjectScope = 'all';
  } else if (client.stdin.isTTY) {
    const choice = await client.input.select({
      message: 'Which tokens do you want to revoke?',
      choices: [
        {
          name: `My tokens — revoke only your own tokens for ${displayName}`,
          value: 'mine',
        },
        {
          name: 'All tokens — revoke every token for all users and installations',
          value: 'all',
        },
      ],
    });
    subjectScope = choice as 'mine' | 'all';
  } else {
    output.error(
      'Scope required. Use --my-tokens to revoke your tokens or --all-tokens to revoke all tokens.'
    );
    return 1;
  }

  // Confirmation
  if (!flags['--yes']) {
    if (!client.stdin.isTTY) {
      output.error(
        'Confirmation required. Use `--yes` to skip the confirmation prompt.'
      );
      return 1;
    }

    if (subjectScope === 'mine') {
      output.log(
        `Tokens issued from ${chalk.bold(displayName)} for your account will stop working. You'll need to re-authorize to use this connector again.`
      );
    } else {
      output.log(
        `Every token issued from ${chalk.bold(displayName)} will stop working. Anyone using this connector will need to re-authorize.`
      );
    }

    if (!supportsRevocation) {
      output.warn(
        `${chalk.bold(displayName)} does not support provider-side token revocation. Tokens will be removed from Vercel Connect but may remain valid at the provider until they expire.`
      );
    }

    const confirmed = await client.input.confirm(
      `${chalk.red('Are you sure?')}`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  const body: Record<string, unknown> =
    subjectScope === 'mine'
      ? { subject: { type: 'user', id: client.authConfig.userId } }
      : {};

  output.spinner('Revoking tokens…');
  let result: RevokeTokensResult;
  try {
    result = await client.fetch<RevokeTokensResult>(
      `/v1/connect/connectors/${encodeURIComponent(target.id)}/tokens`,
      {
        method: 'DELETE',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: unknown) {
    output.stopSpinner();
    const status = (err as { status?: number }).status;
    if (status === 403) {
      output.error(
        `You don't have permission to revoke tokens for ${chalk.bold(displayName)}.`
      );
      return 1;
    }
    output.error(
      `Failed to revoke tokens for ${chalk.bold(displayName)}: ${(err as Error).message}`
    );
    return 1;
  }
  output.stopSpinner();

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          id: target.id,
          uid: target.uid,
          scope: subjectScope,
          supportsRevocation,
          tokensFound: result.tokensFound,
          deleted: result.deleted,
          providerRevoked: result.providerRevoked,
          providerSkipped: result.providerSkipped,
          providerFailed: result.providerFailed,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  const plural = result.deleted === 1 ? 'token' : 'tokens';
  if (subjectScope === 'mine') {
    output.success(
      `Revoked your ${plural} from ${chalk.bold(displayName)} (${result.deleted} ${plural} deleted).`
    );
  } else {
    output.success(
      `Revoked all ${plural} from ${chalk.bold(displayName)} (${result.deleted} ${plural} deleted).`
    );
  }

  if (!supportsRevocation) {
    output.warn(
      `${chalk.bold(displayName)} does not support provider-side token revocation. Tokens were removed from Vercel Connect but may remain valid at the provider until they expire.`
    );
  } else if (result.providerFailed > 0) {
    output.warn(
      `${result.providerFailed} token(s) could not be revoked from the provider. They have been removed from Vercel Connect.`
    );
  }

  return 0;
}
