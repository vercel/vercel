// Native
import { URLSearchParams } from 'url';
import { Readable } from 'node:stream';

// Packages
import retry from 'async-retry';
import jsonlines from 'jsonlines';
import { eraseLines } from 'ansi-escapes';

import type Client from './client';
import getDeployment from './get-deployment';
import getScope from './get-scope';

import type { BuildLog } from './logs';
import output from '../output-manager';

export interface FindOpts {
  direction: 'forward' | 'backward';
  limit?: number;
  since?: number;
  until?: number;
  follow?: boolean;
}

export interface PrintEventsOptions {
  mode: 'deploy' | string;
  onEvent: (event: BuildLog) => void;
  quiet?: boolean;
  findOpts: FindOpts;
}

async function printEvents(
  client: Client,
  urlOrDeploymentId: string,
  { mode, onEvent, quiet, findOpts }: PrintEventsOptions,
  abortController?: AbortController
) {
  const { log, debug } = output;
  const { contextName } = await getScope(client);

  // we keep track of how much we log in case we
  // drop the connection and have to start over
  let o = 0;

  await retry(
    async (bail, attemptNumber) => {
      if (attemptNumber > 1) {
        debug('Retrying events');
      }

      const query = new URLSearchParams({
        direction: findOpts.direction,
        follow: findOpts.follow ? '1' : '',
        format: 'lines',
      });
      if (findOpts.limit) query.set('limit', String(findOpts.limit));
      if (findOpts.since) query.set('since', String(findOpts.since));
      if (findOpts.until) query.set('until', String(findOpts.until));

      const eventsUrl = `/v3/now/deployments/${urlOrDeploymentId}/events?${query}`;
      try {
        const eventsRes = await client.fetch(eventsUrl, {
          json: false,
          signal: abortController?.signal,
        });

        if (eventsRes.ok) {
          const readable = Readable.fromWeb(eventsRes.body! as any);

          // handle the event stream and make the promise get rejected
          // if errors occur so we can retry
          return new Promise<void>((resolve, reject) => {
            const stream = readable.pipe(jsonlines.parse());

            let poller: ReturnType<typeof setTimeout>;

            if (mode === 'deploy') {
              poller = (function startPoller() {
                return setTimeout(async () => {
                  try {
                    const json = await getDeployment(
                      client,
                      contextName,
                      urlOrDeploymentId
                    );
                    if (json.readyState === 'READY') {
                      stream.end();
                      finish();
                      return;
                    }
                    poller = startPoller();
                  } catch (err: unknown) {
                    stream.end();
                    finish(err);
                  }
                }, 5000);
              })();
            }

            let finishCalled = false;
            function finish(err?: unknown) {
              if (finishCalled) return;
              finishCalled = true;
              clearTimeout(poller);
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            }

            let latestLogDate = 0;

            const onData = (data: any) => {
              const { event, payload, date } = data;
              if (event === 'state' && payload.value === 'READY') {
                if (mode === 'deploy') {
                  stream.end();
                  finish();
                }
              } else {
                latestLogDate = Math.max(latestLogDate, date);
                onEvent(data);
              }
            };

            let onErrorCalled = false;
            const onError = (err: Error) => {
              if (finishCalled || onErrorCalled) return;
              if (err.name === 'AbortError') {
                finish();
                return;
              }
              onErrorCalled = true;
              o++;

              const errorMessage = `Deployment event stream error: ${err.message}`;
              if (!findOpts.follow) {
                log(errorMessage);
                return;
              }

              debug(errorMessage);
              clearTimeout(poller);
              stream.destroy(err);

              const retryFindOpts = {
                ...findOpts,
                since: latestLogDate,
              };

              setTimeout(() => {
                if (abortController?.signal.aborted) return;
                // retry without maximum amount nor clear past logs etc
                printEvents(client, urlOrDeploymentId, {
                  mode,
                  onEvent,
                  quiet,
                  findOpts: retryFindOpts,
                }).then(resolve, reject);
              }, 2000);
            };

            stream.on('end', finish);
            stream.on('data', onData);
            stream.on('error', onError);
            readable.on('error', onError);
          });
        }
        const err = new Error(`Deployment events status ${eventsRes.status}`);

        if (eventsRes.status < 500) {
          bail(err);
        } else {
          throw err;
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        throw err;
      }
    },
    {
      retries: 4,
      onRetry: err => {
        // if we are retrying, we clear past logs
        if (!quiet && o) {
          // o + 1 because current line is counted
          process.stdout.write(eraseLines(o + 1));
          o = 0;
        }

        log(`Deployment events polling error: ${err.message}`);
      },
    }
  );
}

export default printEvents;
