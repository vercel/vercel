import type Client from '../../../util/client';
import type {
  AlertRulesNotificationsEnvelope,
  AlertRulesNotificationsResult,
  MonitorsApi,
} from '../types';
import { rulesNotificationsPath } from '../util';

const PAGE_LIMIT = 100;

export async function fetchRulesNotifications(
  client: Client,
  api: MonitorsApi,
  teamId: string
): Promise<AlertRulesNotificationsResult> {
  const notifications: AlertRulesNotificationsResult['notifications'] = {};
  let cursor: string | undefined;

  do {
    const page = await client.fetch<AlertRulesNotificationsEnvelope>(
      rulesNotificationsPath(api, teamId, { limit: PAGE_LIMIT, cursor })
    );
    Object.assign(notifications, page.notifications);
    cursor = page.pagination.next ?? undefined;
  } while (cursor);

  return { notifications };
}
