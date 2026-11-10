import output from '../../output-manager';
import type Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import { isAutoUpdateEnabled, setAutoUpdate } from '../../util/updates';
import { isNativeAutoUpdateEnabled } from './native-auto-update';
import { getVersionContext } from '../../util/version-context';

/**
 * `vc version autoupdate enable|disable|status`: manage the automatic update
 * preference. `status` is the default.
 */
export default async function autoupdate(
  client: Client,
  args: string[]
): Promise<number> {
  const action = args[0];

  if (!action || action === 'status') {
    const context = await getVersionContext();
    const enabled =
      context.manager === 'installer'
        ? isNativeAutoUpdateEnabled(client.config)
        : isAutoUpdateEnabled(client.config);
    output.print(`Automatic updates are ${enabled ? 'enabled' : 'disabled'}\n`);
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
    `Invalid argument "${action}". Usage: ${getCommandName('version autoupdate enable|disable|status')}`
  );
  return 2;
}
