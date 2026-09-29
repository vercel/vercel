import type Client from '../util/client';
import { getSentry } from '../util/get-sentry';
import reportError from '../util/report-error';

/** Reports unexpected errors to the error tracking service. */
export type ErrorReporter = {
  report(input: { error: unknown; client: Client | undefined }): Promise<void>;
};

export function liveErrorReporter(): ErrorReporter {
  return {
    async report({ error, client }) {
      // `reportError` tolerates a missing client: the scope lookup that
      // needs it runs inside a try/catch and only adds metadata.
      await reportError(await getSentry(), client as Client, error);
    },
  };
}
