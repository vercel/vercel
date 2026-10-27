import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';
import type { FetchOptions } from '../client';
import { directFetch } from '../fetch';
import responseError from '../response-error';
import { DEV_RESOURCE_TOKEN } from '../dev/resource-servers';
import {
  isLocalSchedulesOrigin,
  LOCAL_SCHEDULES_SESSION_HEADER,
  type LocalSchedulesSession,
} from '../dev/schedules-session';
import type {
  CreateScheduleParams,
  DeleteScheduleResponse,
  EnableScheduleParams,
  ListExecutionsParams,
  ListExecutionsResponse,
  ListSchedulesParams,
  ListSchedulesResponse,
  Schedule,
  ScheduleIdentifier,
  UpdateScheduleParams,
} from './types';

export const DEFAULT_SCHEDULES_BASE_URL = 'https://vercel-schedules.com';
export const DEFAULT_SCHEDULE_NAMESPACE = 'default';
export const DEFAULT_SCHEDULES_LIMIT = 20;
export const SCHEDULES_REQUEST_SOURCE_HEADER = 'x-vss-client';

type SchedulesClientOptions =
  | {
      ownerId: string;
      projectId: string;
      baseUrl?: string;
      /** Selects the Track by environment: production or a custom environment slug. */
      environment?: string;
      /** Selects the Track of a Git branch in the project's linked repository. */
      gitBranch?: string;
    }
  | { local: LocalSchedulesSession };

export class LocalSchedulesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalSchedulesError';
  }
}

type ScheduleApiResponse = Schedule & { trackId: string };
interface ListSchedulesApiResponse {
  data: ScheduleApiResponse[];
  cursor: string | null;
}

function sanitizeSchedule(schedule: ScheduleApiResponse): Schedule {
  const { trackId: _trackId, ...publicSchedule } = schedule;
  return publicSchedule;
}

/**
 * Client for either the cloud Schedules API or a verified local dev session.
 *
 * The Vercel CLI client supplies the user's bearer token. Schedules requests
 * also carry the linked project and its owner because user tokens are not
 * project-scoped like the OIDC tokens used by the Schedules SDK.
 */
export class SchedulesClient {
  private readonly baseUrl: URL;

  constructor(
    private readonly client: Client,
    private readonly options: SchedulesClientOptions
  ) {
    if ('local' in options) {
      if (!isLocalSchedulesOrigin(options.local.origin)) {
        throw new LocalSchedulesError(
          'Local Schedules requires an HTTP 127.0.0.1 endpoint with a valid port.'
        );
      }
      this.baseUrl = new URL(options.local.origin);
      return;
    }
    this.baseUrl = new URL(
      options.baseUrl ??
        process.env.VERCEL_SCHEDULE_BASE_URL ??
        DEFAULT_SCHEDULES_BASE_URL
    );
  }

  get localOrigin(): string | undefined {
    return 'local' in this.options ? this.baseUrl.origin : undefined;
  }

  private async request<T>(
    path: string,
    options: FetchOptions = {}
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if ('local' in this.options) {
      const session = this.options.local;
      url.searchParams.set('projectId', session.projectId);
      let response;
      try {
        // Local mode never uses the cloud client's auth, proxy, or retries.
        response = await directFetch(url.href, {
          method: options.method ?? 'GET',
          headers: {
            authorization: `Bearer ${DEV_RESOURCE_TOKEN}`,
            [LOCAL_SCHEDULES_SESSION_HEADER]: session.id,
            [SCHEDULES_REQUEST_SOURCE_HEADER]: 'cli',
            ...(options.body === undefined
              ? {}
              : { 'content-type': 'application/json' }),
          },
          body:
            options.body === undefined
              ? undefined
              : JSON.stringify(options.body),
          redirect: 'manual',
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw new LocalSchedulesError(
          `Could not reach local Schedules at ${session.origin}. No cloud request was made.`
        );
      }
      if (
        (response.status >= 300 && response.status < 400) ||
        response.headers.get(LOCAL_SCHEDULES_SESSION_HEADER) !== session.id
      ) {
        await response.body?.cancel();
        throw new LocalSchedulesError(
          'The local Schedules session changed or returned an unexpected response. Restart vercel dev and try again.'
        );
      }
      if (!response.ok) throw await responseError(response);
      if (response.status === 204) return undefined as T;
      try {
        return (await response.json()) as T;
      } catch {
        throw new LocalSchedulesError(
          'The local Schedules session returned an invalid JSON response.'
        );
      }
    }
    url.searchParams.set('projectId', this.options.projectId);
    if (this.options.environment !== undefined) {
      url.searchParams.set('env', this.options.environment);
    }
    if (this.options.gitBranch !== undefined) {
      url.searchParams.set('branch', this.options.gitBranch);
    }

    const headers = new globalThis.Headers(options.headers);
    headers.set(SCHEDULES_REQUEST_SOURCE_HEADER, 'cli');

    return this.client.fetch<T>(url.href, {
      ...options,
      headers,
      accountId: this.options.ownerId,
      useCurrentTeam: false,
    });
  }

  private schedulePath(name: string, namespace: string, suffix = ''): string {
    const path = `/v1/schedules/${encodeURIComponent(name)}${suffix}`;
    return `${path}?${new URLSearchParams({ namespace })}`;
  }

  async create({ target, ...params }: CreateScheduleParams): Promise<Schedule> {
    const schedule = await this.request<ScheduleApiResponse>('/v1/schedules', {
      method: 'POST',
      bailOn429: true,
      body: {
        ...params,
        target: { type: 'queue', topic: target.topic },
      } as JSONObject,
    });

    return sanitizeSchedule(schedule);
  }

  async get({
    name,
    namespace = DEFAULT_SCHEDULE_NAMESPACE,
  }: ScheduleIdentifier): Promise<Schedule> {
    const schedule = await this.request<ScheduleApiResponse>(
      this.schedulePath(name, namespace),
      {
        bailOn429: true,
      }
    );

    return sanitizeSchedule(schedule);
  }

  async list({
    namespace = DEFAULT_SCHEDULE_NAMESPACE,
    cursor,
    limit = DEFAULT_SCHEDULES_LIMIT,
  }: ListSchedulesParams = {}): Promise<ListSchedulesResponse> {
    const searchParams = new URLSearchParams({
      namespace,
      limit: String(limit),
    });
    if (cursor !== undefined) {
      searchParams.set('cursor', cursor);
    }

    const response = await this.request<ListSchedulesApiResponse>(
      `/v1/schedules?${searchParams}`,
      { bailOn429: true }
    );

    return {
      data: response.data.map(sanitizeSchedule),
      cursor: response.cursor,
    };
  }

  async update({
    name,
    namespace = DEFAULT_SCHEDULE_NAMESPACE,
    target,
    ...params
  }: UpdateScheduleParams): Promise<Schedule> {
    const schedule = await this.request<ScheduleApiResponse>(
      this.schedulePath(name, namespace),
      {
        method: 'PATCH',
        bailOn429: true,
        body: {
          ...params,
          ...(target ? { target: { type: 'queue', topic: target.topic } } : {}),
        } as JSONObject,
      }
    );

    return sanitizeSchedule(schedule);
  }

  async delete({
    name,
    namespace = DEFAULT_SCHEDULE_NAMESPACE,
  }: ScheduleIdentifier): Promise<DeleteScheduleResponse> {
    return this.request<DeleteScheduleResponse>(
      this.schedulePath(name, namespace),
      {
        method: 'DELETE',
        bailOn429: true,
      }
    );
  }

  async enable({
    name,
    namespace = DEFAULT_SCHEDULE_NAMESPACE,
    activeUntil,
  }: EnableScheduleParams): Promise<Schedule> {
    return this.changeState(
      name,
      namespace,
      'enable',
      activeUntil === undefined ? undefined : { until: activeUntil }
    );
  }

  async disable({
    name,
    namespace = DEFAULT_SCHEDULE_NAMESPACE,
  }: ScheduleIdentifier): Promise<Schedule> {
    return this.changeState(name, namespace, 'disable');
  }

  private async changeState(
    name: string,
    namespace: string,
    action: 'enable' | 'disable',
    body?: { until: number }
  ): Promise<Schedule> {
    const schedule = await this.request<ScheduleApiResponse>(
      this.schedulePath(name, namespace, `/${action}`),
      { method: 'POST', bailOn429: true, ...(body && { body }) }
    );
    return sanitizeSchedule(schedule);
  }

  async invoke({
    name,
    namespace = DEFAULT_SCHEDULE_NAMESPACE,
  }: ScheduleIdentifier): Promise<void> {
    await this.request<void>(this.schedulePath(name, namespace, '/invoke'), {
      method: 'POST',
      bailOn429: true,
      // Invoke is not idempotent; a lost response may follow a successful enqueue.
      retry: { retries: 0 },
    });
  }

  async listExecutions({
    name,
    namespace = DEFAULT_SCHEDULE_NAMESPACE,
    cursor,
    limit = DEFAULT_SCHEDULES_LIMIT,
    sort,
    from,
    to,
    executionId,
  }: ListExecutionsParams): Promise<ListExecutionsResponse> {
    if ('local' in this.options) {
      throw new LocalSchedulesError(
        'Execution history is not supported for local Schedules. Inspect the vercel dev output for local executions.'
      );
    }
    const searchParams = new URLSearchParams({
      limit: String(limit),
    });
    if (cursor !== undefined) {
      searchParams.set('cursor', cursor);
    }
    if (sort !== undefined) {
      searchParams.set('sort', sort);
    }
    if (from !== undefined) {
      searchParams.set('from', String(from));
    }
    if (to !== undefined) {
      searchParams.set('to', String(to));
    }
    if (executionId !== undefined) {
      searchParams.set('executionId', executionId);
    }

    return this.request<ListExecutionsResponse>(
      `${this.schedulePath(name, namespace, '/executions')}&${searchParams}`,
      { bailOn429: true }
    );
  }
}
