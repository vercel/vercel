// Native
import { URLSearchParams } from 'url';

// Packages
import retry from 'async-retry';
import jsonlines from 'jsonlines';
import { eraseLines } from 'ansi-escapes';

import Client from './client';
import { getDeployment } from './get-deployment';

export interface FindOpts {
  direction: 'forward' | 'backward';
  limit?: number;
  since?: number;
  until?: number;
  follow?: boolean;
}

export interface PrintEventsOptions {
  mode: string;
  onEvent: (event: DeploymentEvent) => void;
  quiet?: boolean;
  findOpts: FindOpts;
}

export interface DeploymentEvent {
  id: string;
  created: number;
  date?: number;
  serial?: string;
}

async function printEvents(
  client: Client,
  deploymentIdOrURL: string,
  { mode, onEvent, quiet, findOpts }: PrintEventsOptions
) {
  const { log, debug } = client.output;

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

      const eventsUrl = `/v1/now/deployments/${deploymentIdOrURL}/events?${query}`;
      const eventsRes = await client.fetch(eventsUrl, { json: false });

      if (eventsRes.ok) {
        const readable = eventsRes.body;

        // handle the event stream and make the promise get rejected
        // if errors occur so we can retry
        return new Promise<void>((resolve, reject) => {
          const stream = readable.pipe(jsonlines.parse());

          let poller: ReturnType<typeof setTimeout>;

          if (mode === 'deploy') {
            poller = (function startPoller() {
              return setTimeout(async () => {
                try {
                  const json = await getDeployment(client, deploymentIdOrURL);
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
              // retry without maximum amount nor clear past logs etc
              printEvents(client, deploymentIdOrURL, {
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

        log(`Deployment state polling error: ${err.message}`);
      },
    }
  );
}

export default printEvents;
