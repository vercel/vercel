import output from '../../output-manager';
import type Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import { isAutoUpdateEnabled, setAutoUpdate } from '../../util/updates';

/**
 * `vc version autoupdate [enable|disable|status]`: manage the automatic
 * update preference. No argument shows the current status.
 */
export default async function autoupdate(
  client: Client,
  args: string[]
): Promise<number> {
  const action = args[0];

  if (!action || action === 'status') {
    output.print(
      `Automatic updates are ${isAutoUpdateEnabled(client.config) ? 'enabled' : 'disabled'}\n`
    );
    return 0;
  }

  if (action === 'enable' || action === 'disable') {
    const enabled = action === 'enable';
    setAutoUpdate(client, enabled);
    output.success(
      `Automatic CLI updates ${enabled ? 'enabled' : 'disabled'}.`
    );
    return 0;
  }

  output.error(
    `Invalid argument "${action}". Usage: ${getCommandName('version autoupdate [enable|disable|status]')}`
  );
  return 1;
}
