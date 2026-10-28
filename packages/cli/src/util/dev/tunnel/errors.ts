import { ConnectError } from '@connectrpc/connect';
import { APIError } from '../../errors-ts';
import { remoteText } from '../../output/remote-text';

/**
 * A tunnel failure whose message is the CLI's own copy. What the tunnel
 * service or the deployment said stays apart, shown attributed and stripped,
 * never as the headline.
 */
export class TunnelError extends Error {
  /** Who said what, e.g. the tunnel service's reason for refusing. */
  readonly remote?: { source: string; message: string };
  /** The proxy deployment's inspector, where its build logs are. */
  readonly inspectorUrl?: string;

  constructor(
    message: string,
    options: {
      remote?: { source: string; message: string };
      inspectorUrl?: string;
    } = {}
  ) {
    super(message);
    this.name = 'TunnelError';
    this.remote = options.remote;
    this.inspectorUrl = options.inspectorUrl;
  }
}

/**
 * The rows under a tunnel failure's headline: the remote side's words,
 * attributed and stripped, then where to look. An error without CLI copy shows
 * its message the same way, under who said it when that's known.
 */
export function tunnelErrorRows(err: unknown): string[] {
  if (err instanceof TunnelError) {
    const rows = err.remote
      ? [`${err.remote.source}: ${remoteText(err.remote.message)}`]
      : [];
    if (err.inspectorUrl) {
      rows.push(
        '',
        'Inspect the deployment:',
        `  ${remoteText(err.inspectorUrl)}`
      );
    }
    return rows;
  }
  if (err instanceof APIError) {
    return [`Vercel API: ${remoteText(err.serverMessage || err.message)}`];
  }
  if (err instanceof ConnectError) {
    // One the service sent has no cause; a local failure, e.g. a refused
    // connection, wraps its own.
    const source = err.cause === undefined ? 'Tunnel service' : 'Reason';
    return [`${source}: ${remoteText(err.rawMessage)}`];
  }
  return [
    `Reason: ${remoteText(err instanceof Error ? err.message : String(err))}`,
  ];
}

/** A headline, then the failure's rows, for output.fatal() or warning(). */
export function formatTunnelError(headline: string, err: unknown): string {
  return [headline, ...tunnelErrorRows(err)].join('\n');
}
