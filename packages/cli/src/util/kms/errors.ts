import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../client';
import { isAPIError } from '../errors-ts';
import { outputAgentError } from '../agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../agent-output-constants';

/** `403` code the API returns when another service provisioned the issuer. */
const MANAGED_ISSUER_CODE = 'issuer_managed_by_mismatch';

type NextCommands = Array<{ command: string; when?: string }>;

export interface HandleKmsApiErrorOptions {
  /**
   * Full sentence for a 404, e.g. `Issuer not found: iss_123.` Omit it when the
   * route has no addressable resource, so a 404 reports as an API error.
   */
  notFound?: string;
  /** What the caller tried to do, e.g. `Updating an issuer`. */
  attempted: string;
  /** Team or username the command ran against. */
  contextName: string;
  next?: NextCommands;
}

/**
 * Translates a KMS API failure into human and agent output.
 *
 * Returns an exit code for failures the commands can explain, and `undefined`
 * for anything unrecognized so the caller rethrows it.
 */
export function handleKmsApiError(
  client: Client,
  err: unknown,
  { notFound, attempted, contextName, next }: HandleKmsApiErrorOptions
): number | undefined {
  if (!isAPIError(err)) {
    return undefined;
  }

  if (err.status === 404 && notFound) {
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.ISSUER_NOT_FOUND,
        message: notFound,
        next,
      },
      1
    );
    output.error(notFound);
    return 1;
  }

  if (err.status === 403 && err.code === MANAGED_ISSUER_CODE) {
    const message = `${attempted} isn't available for this issuer. It was provisioned by another Vercel service, which manages its keys and grants.`;
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.ISSUER_MANAGED,
        message,
      },
      1
    );
    output.error(message);
    return 1;
  }

  if (err.status === 403) {
    const message = `${attempted} requires the Owner role on ${contextName}.`;
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.PERMISSION_DENIED,
        message,
        ...(err.action && { action: err.action }),
        ...(typeof err.resource === 'string' && { resource: err.resource }),
      },
      1
    );
    output.error(message);
    output.log(
      `Ask an Owner of ${chalk.bold(contextName)} to run it, or switch teams with ${chalk.cyan('--scope')}.`
    );
    return 1;
  }

  const message = err.serverMessage || err.message;
  outputAgentError(
    client,
    {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.API_ERROR,
      message,
    },
    1
  );
  output.error(message);
  return 1;
}
