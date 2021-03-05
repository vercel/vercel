// Native
import { URLSearchParams } from 'url';

// Packages
import { eraseLines } from 'ansi-escapes';

import jsonlines from 'jsonlines';
import retry from 'async-retry';

async function printEvents(
  now,
  deploymentIdOrURL,
  currentTeam = null,
  {
    mode,
    onOpen = () => {},
    onEvent,
    quiet,
    debugEnabled,
    findOpts,
    output,
  } = {}
) {
  const { log, debug } = output;

  let onOpenCalled = false;
  function callOnOpenOnce() {
    if (onOpenCalled) return;
    onOpenCalled = true;
    onOpen();
  }

  const query = new URLSearchParams({
    direction: findOpts.direction,
    limit: findOpts.limit,
    since: findOpts.since,
    until: findOpts.until,
    follow: findOpts.follow ? '1' : '',
    format: 'lines',
  });

  let eventsUrl = `/v1/now/deployments/${deploymentIdOrURL}/events?${query}`;
  let pollUrl = `/v3/now/deployments/${deploymentIdOrURL}`;

  if (currentTeam) {
    eventsUrl += `&teamId=${currentTeam.id}`;
    pollUrl += `?teamId=${currentTeam.id}`;
  }

  debug(`Events ${eventsUrl}`);

  // we keep track of how much we log in case we
  // drop the connection and have to start over
  let o = 0;

  await retry(
    async (bail, attemptNumber) => {
      if (attemptNumber > 1) {
        debug('Retrying events');
      }

      const eventsRes = await now._fetch(eventsUrl);

      if (eventsRes.ok) {
        const readable = eventsRes.readable
          ? await eventsRes.readable()
          : eventsRes.body;

        // handle the event stream and make the promise get rejected
        // if errors occur so we can retry
        return new Promise((resolve, reject) => {
          const stream = readable.pipe(jsonlines.parse());

          let poller;

          if (mode === 'deploy') {
            poller = (function startPoller() {
              return setTimeout(async () => {
                try {
                  const pollRes = await now._fetch(pollUrl);
                  if (!pollRes.ok)
                    throw new Error(`Response ${pollRes.status}`);
                  const json = await pollRes.json();
                  if (json.state === 'READY') {
                    stream.end();
                    finish();
                    return;
                  }
                  poller = startPoller();
                } catch (error) {
                  stream.end();
                  finish(error);
                }
              }, 5000);
            })();
          }

          let finishCalled = false;
          function finish(error) {
            if (finishCalled) return;
            finishCalled = true;
            callOnOpenOnce();
            clearTimeout(poller);
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          }

          let latestLogDate = 0;

          const onData = data => {
            const { event } = data;
            if (event === 'state' && data.payload.value === 'READY') {
              if (mode === 'deploy') {
                stream.end();
                finish();
              }
            } else {
              latestLogDate = Math.max(latestLogDate, data.date);
              const linesPrinted = onEvent(data, callOnOpenOnce);
              o += linesPrinted || 0;
            }
          };

          let onErrorCalled = false;
          const onError = err => {
            if (finishCalled || onErrorCalled) return;
            onErrorCalled = true;
            o++;
            callOnOpenOnce();

            const errorMessage = `Deployment event stream error: ${err.message}`;
            if (!findOpts.follow) {
              log(errorMessage);
              return;
            }

            debug(errorMessage);
            clearTimeout(poller);
            stream.destroy(err);
            readable.destroy(err);

            const retryFindOpts = {
              ...findOpts,
              since: latestLogDate,
            };

            setTimeout(() => {
              // retry without maximum amount nor clear past logs etc
              printEvents(now, deploymentIdOrURL, currentTeam, {
                mode,
                onOpen,
                onEvent,
                quiet,
                debugEnabled,
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
      callOnOpenOnce();
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
