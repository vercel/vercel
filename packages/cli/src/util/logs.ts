import type { Deployment } from '@vercel-internals/types';
import { printLogShort } from '../commands/logs';
import Client from '../util/client';
import printEvents from './events';

export function displayBuildLogs(
  client: Client,
  deployment: Deployment,
  follow?: true
): {
  promise: Promise<void>;
  abortController: AbortController;
};
export function displayBuildLogs(
  client: Client,
  deployment: Deployment,
  follow: false
): {
  promise: Promise<void>;
  abortController: AbortController;
};
export function displayBuildLogs(
  client: Client,
  deployment: Deployment,
  follow: boolean = true
) {
  const abortController = new AbortController();
  const promise = printEvents(
    client,
    deployment.id,
    {
      mode: 'logs',
      onEvent: (event: any) => printLogShort(event, client),
      quiet: false,
      findOpts: { direction: 'forward', follow },
    },
    abortController
  );
  return { promise, abortController };
}
