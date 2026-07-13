import type Client from '../../util/client';
import { coverageDemoCommand } from './command';

/**
 * Intentionally calls a private endpoint that is not listed in
 * `coverageDemoCommand.endpoints` (which only declares `GET /v2/user`).
 */
export default async function coverageDemo(client: Client): Promise<number> {
  await client.fetch('/v2/user');
  await client.fetch('/v1/oauth-apps/installations', { method: 'GET' });
  void coverageDemoCommand;
  return 0;
}
