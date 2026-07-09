import type Client from '../client';
import output from '../../output-manager';
import stamp from '../output/stamp';
import { isAPIError } from '../errors-ts';

export interface RenderResourceOptions<T> {
  /** Whether the caller resolved `--format json`. */
  asJson: boolean;
  /** Present-participle spinner text shown while fetching. */
  spinnerText: string;
  /** Fetches the resource from the AI Gateway API. */
  fetch: () => Promise<T>;
  /** Maps the fetched data to the `--format json` payload. */
  toJSON: (data: T) => unknown;
  /** True when there is nothing to show in the table. */
  isEmpty: (data: T) => boolean;
  /** Message printed for the empty state, e.g. `No models found.`. */
  emptyMessage: string;
  /** Table heading; the elapsed-time stamp is appended automatically. */
  header: (data: T) => string;
  /** Renders the human table for a non-empty result. */
  renderTable: (data: T) => string;
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
  }: RenderResourceOptions<T>
): Promise<number> {
  const lsStamp = stamp();
  output.spinner(spinnerText);

  let data: T;
  try {
    data = await fetch();
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }

  output.stopSpinner();

  if (asJson) {
    client.stdout.write(`${JSON.stringify(toJSON(data), null, 2)}\n`);
    return 0;
  }

  if (isEmpty(data)) {
    output.log(emptyMessage);
    return 0;
  }

  output.log(`${header(data)} ${lsStamp()}`);
  client.stdout.write(renderTable(data));
  return 0;
}
