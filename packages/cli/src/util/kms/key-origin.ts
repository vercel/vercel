import output from '../../output-manager';
import type Client from '../client';
import { getCommandName } from '../pkg-name';
import { outputAgentError } from '../agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../agent-output-constants';
import { getIssuer } from './issuers';
import { handleKmsApiError } from './errors';
import { kmsSuggestion } from './args';
import type { Issuer } from './types';

/** Where the key material for a new signing key comes from. */
export type KeySource = 'generated' | 'imported';

/**
 * Resolves the issuer a new signing key is for, and rejects the mismatch
 * between the issuer and the command. Key material is fixed per issuer: an
 * issuer created by importing a key (`origin: external`) takes imported keys
 * only, and every other issuer takes generated keys only. The API answers a
 * mismatch with a 400, so resolve it here and name the command that works.
 */
export async function resolveIssuerForKeySource(
  client: Client,
  issuerId: string,
  options: { source: KeySource; attempted: string; contextName: string }
): Promise<Issuer | number> {
  if (!client.nonInteractive) {
    output.spinner(`Fetching issuer ${issuerId}`);
  }

  let issuer: Issuer;
  try {
    issuer = await getIssuer(client, issuerId);
  } catch (err: unknown) {
    output.stopSpinner();
    const handled = handleIssuerLookupError(client, err, issuerId, options);
    if (handled !== undefined) {
      return handled;
    }
    throw err;
  }
  output.stopSpinner();

  const takesImportedKeys = issuer.origin === 'external';
  if (takesImportedKeys && options.source === 'generated') {
    return rejectMismatch(client, {
      reason: AGENT_REASON.ISSUER_REQUIRES_IMPORTED_KEY,
      message: `Issuer ${issuerId} was created from a key you imported, so its keys must be imported too.`,
      command: `kms import-key ${issuerId} --key <file>`,
      when: 'Import the next signing key',
    });
  }
  if (!takesImportedKeys && options.source === 'imported') {
    return rejectMismatch(client, {
      reason: AGENT_REASON.ISSUER_REQUIRES_GENERATED_KEY,
      message: `Vercel generates the signing keys for issuer ${issuerId}, so a key cannot be imported into it.`,
      command: `kms add-key ${issuerId}`,
      when: 'Add a Vercel-generated key instead',
    });
  }

  return issuer;
}

function rejectMismatch(
  client: Client,
  options: { reason: string; message: string; command: string; when: string }
): number {
  outputAgentError(
    client,
    {
      status: AGENT_STATUS.ERROR,
      reason: options.reason,
      message: options.message,
      next: [
        {
          command: kmsSuggestion(options.command, client.argv),
          when: options.when,
        },
      ],
    },
    1
  );
  output.error(options.message);
  output.log(`Run ${getCommandName(options.command)} instead.`);
  return 1;
}

function handleIssuerLookupError(
  client: Client,
  err: unknown,
  issuerId: string,
  options: { attempted: string; contextName: string }
): number | undefined {
  return handleKmsApiError(client, err, {
    notFound: `Issuer not found: ${issuerId}.`,
    attempted: options.attempted,
    contextName: options.contextName,
    next: [
      {
        command: kmsSuggestion('kms ls', client.argv),
        when: 'List issuers in this team',
      },
    ],
  });
}
