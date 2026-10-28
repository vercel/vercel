import type Client from '../../util/client';
import {
  fetchEventPages as fetchObservabilityEventPages,
  type EventsPage,
  type EventsResult,
  type ObservabilityEvent,
} from '../../util/observability/events';
import type { LogsSource } from './sources';
import type { LogsTimeRange } from './time-range';

export {
  MAX_PAGE_SIZE,
  InvalidEventsResponseError,
  RecordTooLargeError,
  type EventsPage,
  type EventsResult,
  type ExcludedInterval,
} from '../../util/observability/events';

export type LogEvent = ObservabilityEvent;

/** Quotes a generated filter value so it always parses as one literal. */
export function quoteFilterValue(value: string): string {
  return JSON.stringify(value);
}

/**
 * Combines generated predicates with the user's filter. Each clause is
 * parenthesized, so an `OR` in the user's filter cannot bypass the deployment,
 * environment, or fixed source predicates.
 */
export function composeFilter({
  source,
  deploymentId,
  environment,
  filter,
}: {
  source: LogsSource;
  deploymentId?: string;
  environment?: string;
  filter?: string;
}): string | undefined {
  const clauses: string[] = [];
  if (deploymentId) {
    clauses.push(`deploymentId:${quoteFilterValue(deploymentId)}`);
  }
  if (environment) {
    clauses.push(`environment:${quoteFilterValue(environment)}`);
  }
  clauses.push(...source.fixedFilters);
  if (filter) {
    clauses.push(filter);
  }
  if (clauses.length === 0) {
    return undefined;
  }
  return clauses.map(clause => `(${clause})`).join(' AND ');
}

export interface EventsQuery {
  readonly source: LogsSource;
  readonly teamId: string;
  readonly projectId: string;
  readonly timeRange: LogsTimeRange;
  readonly filter?: string;
}

/**
 * Yields pages of a logs query newest first. See `fetchEventPages` in
 * `util/observability/events.ts` for paging and size-reduction behavior.
 */
export function fetchEventPages(
  client: Client,
  query: EventsQuery,
  limit: number,
  startCursor?: string
): AsyncGenerator<EventsPage, EventsResult> {
  return fetchObservabilityEventPages(
    client,
    {
      event: query.source.event,
      ownerId: query.teamId,
      projectIds: [query.projectId],
      timeRange: {
        start: query.timeRange.start.toISOString(),
        end: query.timeRange.end.toISOString(),
      },
      filter: query.filter,
      select: query.source.select,
      queryReason: query.source.queryReason,
    },
    limit,
    startCursor
  );
}
