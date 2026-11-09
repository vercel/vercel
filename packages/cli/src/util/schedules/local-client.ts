import type Client from '../client';
import { DEV_RESOURCE_TOKEN } from '../dev/resource-servers';
import {
  LOCAL_SCHEDULES_SESSION_HEADER,
  readLocalSchedulesSessions,
} from '../dev/schedules-session';
import { directFetch } from '../fetch';
import {
  LocalSchedulesError,
  SCHEDULES_REQUEST_SOURCE_HEADER,
  SchedulesClient,
} from './client';

export async function createLocalSchedulesClient(
  client: Client
): Promise<SchedulesClient> {
  const sessions = await readLocalSchedulesSessions(client.cwd);
  if (sessions.length === 0) {
    throw new LocalSchedulesError(
      'No running local Schedules session was found in this directory. Start vercel dev here, or use --cwd to select its project directory.'
    );
  }
  if (sessions.length > 1) {
    throw new LocalSchedulesError(
      'Multiple vercel dev sessions are running in this directory. Stop the extra instances before using schedules --local.'
    );
  }
  const [session] = sessions;
  let response;
  try {
    response = await directFetch(`${session.origin}/v1/info`, {
      headers: {
        authorization: `Bearer ${DEV_RESOURCE_TOKEN}`,
        [LOCAL_SCHEDULES_SESSION_HEADER]: session.id,
        [SCHEDULES_REQUEST_SOURCE_HEADER]: 'cli',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    throw new LocalSchedulesError(
      `The local Schedules session at ${session.origin} is unavailable. Restart vercel dev in this directory. No cloud request was made.`
    );
  }
  if (
    !response.ok ||
    response.headers.get(LOCAL_SCHEDULES_SESSION_HEADER) !== session.id
  ) {
    await response.body?.cancel();
    throw new LocalSchedulesError(
      'The local Schedules session is stale, not ready, or incompatible. Restart vercel dev in this directory.'
    );
  }
  let info;
  try {
    info = await response.json();
  } catch {
    throw new LocalSchedulesError(
      'The local Schedules session returned invalid metadata. Restart vercel dev in this directory.'
    );
  }
  if (
    !info ||
    info.version !== session.version ||
    info.id !== session.id ||
    info.pid !== session.pid ||
    info.cwd !== session.cwd ||
    info.origin !== session.origin ||
    info.projectId !== session.projectId
  ) {
    throw new LocalSchedulesError(
      'The local Schedules session does not match this project instance. Restart vercel dev in this directory.'
    );
  }
  return new SchedulesClient(client, { local: session });
}
