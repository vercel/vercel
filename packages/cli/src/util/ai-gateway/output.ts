import type Client from '../client';
import output from '../../output-manager';
import stamp from '../output/stamp';
import { isAPIError } from '../errors-ts';
import { PaginationError, printNextPageHint } from '../pagination';

export interface RenderResourceOptions<T> {
  /** Whether the caller resolved JSON output. */
  asJson: boolean;
  /** Present-participle spinner text shown while fetching. */
  spinnerText: string;
  /** Fetches the resource from the AI Gateway API. */
  fetch: () => Promise<T>;
  /** Maps the fetched data to the JSON payload. */
  toJSON: (data: T) => unknown;
  /** True when there is nothing to show in the table. */
  isEmpty: (data: T) => boolean;
  /** Message printed for the empty state, e.g. `No models found.`. */
  emptyMessage: string;
  /** Table heading; the elapsed-time stamp is appended automatically. */
  header: (data: T) => string;
  /** Renders the human table for a non-empty result. */
  renderTable: (data: T) => string;
  /** Shown instead of the api's message when the fetch 404s. */
  notFoundMessage?: string;
  /** Cursor for the next page; prints the next-page hint after the table. */
  next?: (data: T) => string | null;
}

/**
 * Shared fetch → (JSON | table) flow for read-only AI Gateway list commands.
 * Callers own argument parsing, telemetry, and per-command formatting; this
 * helper owns the spinner, API-error handling, and output surfaces so the
 * commands stay consistent.
 */
export async function renderResource<T>(
  client: Client,
  {
    asJson,
    spinnerText,
    fetch,
    toJSON,
    isEmpty,
    emptyMessage,
    header,
    renderTable,
    notFoundMessage,
    next,
  }: RenderResourceOptions<T>
): Promise<number> {
  const lsStamp = stamp();
  // Non-interactive callers (agents, --non-interactive) get parseable JSON and
  // no spinner, matching the deploy-hooks convention.
  const json = asJson || client.nonInteractive;
  if (!client.nonInteractive) {
    output.spinner(spinnerText);
  }

  let data: T;
  try {
    data = await fetch();
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(
        err.status === 404 && notFoundMessage ? notFoundMessage : err.message
      );
      return 1;
    }
    if (err instanceof PaginationError) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }

  output.stopSpinner();

  if (json) {
    client.stdout.write(`${JSON.stringify(toJSON(data), null, 2)}\n`);
    return 0;
  }

  if (isEmpty(data)) {
    // A filtered page can come back empty with more pages still to read.
    const nextCursor = next?.(data) ?? null;
    if (nextCursor) {
      output.log('No results on this page.');
      printNextPageHint(client, nextCursor);
      return 0;
    }
    output.log(emptyMessage);
    return 0;
  }

  output.log(`${header(data)} ${lsStamp()}`);
  client.stdout.write(renderTable(data));
  if (next) {
    printNextPageHint(client, next(data));
  }
  return 0;
}
