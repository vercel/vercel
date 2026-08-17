import output from '../../output-manager';
import pkg from '../../util/pkg';
import type Client from '../../util/client';
import { isAutoUpdateEnabled } from '../../util/updates';
import {
  isCurlInstall,
  getLinkedVersion,
  getPinnedVersion,
  getPrBuildSha,
  CURL_INSTALL_COMMAND,
} from '../../util/native-self-update';
import getUpdateCommand from '../../util/get-update-command';
import { getCommandName } from '../../util/pkg-name';

/**
 * Default action for `vc version`: show the current version and how the CLI
 * is installed/managed.
 */
export default async function status(client: Client): Promise<number> {
  const curl = await isCurlInstall();

  output.print(`Version: ${pkg.version}\n`);

  if (curl) {
    const [linked, pinned] = await Promise.all([
      getLinkedVersion(),
      getPinnedVersion(),
    ]);
    output.print(`Managed by: Vercel installer (~/.vercel)\n`);
    if (linked?.startsWith('pr-')) {
      const sha = await getPrBuildSha(linked);
      output.print(
        `Build: PR #${linked.slice(3)}${sha ? ` (${sha.slice(0, 12)})` : ''} — a mutable pre-release build, not the v${pkg.version} release\n`
      );
    } else if (linked && linked !== pkg.version) {
      output.print(`Linked version: ${linked}\n`);
    }
    if (pinned) {
      output.print(
        `Pinned: yes (${pinned}) — automatic updates and update notices are paused until you run ${getCommandName('version use latest')}\n`
      );
    }
  } else {
    const updateCommand = await getUpdateCommand().catch(() => undefined);
    output.print(`Managed by: package manager\n`);
    if (updateCommand) {
      output.print(`Upgrade command: ${updateCommand}\n`);
    }
    output.print(
      `Tip: the recommended way to manage the Vercel CLI is the installer: ${CURL_INSTALL_COMMAND}\n`
    );
  }

  const autoUpdates = isAutoUpdateEnabled(client.config);
  const pinnedNote = autoUpdates && (await getPinnedVersion());
  output.print(
    `Automatic updates: ${autoUpdates ? 'Enabled' : 'Disabled'}${pinnedNote ? ' (paused while pinned)' : ''}\n`
  );

  return 0;
}
