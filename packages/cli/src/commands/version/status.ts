import output from '../../output-manager';
import type Client from '../../util/client';
import { isAutoUpdateEnabled } from '../../util/updates';
import { getCommandName } from '../../util/pkg-name';
import {
  CURL_INSTALL_COMMAND,
  describeManager,
  describeRuntime,
  getVersionContext,
} from '../../util/version-context';

/**
 * Default action for `vc version`: show the current version and how the CLI
 * is installed/managed.
 */
export default async function status(client: Client): Promise<number> {
  const context = await getVersionContext();

  output.print(`Version: ${context.version}\n`);
  output.print(`Runtime: ${describeRuntime(context)}\n`);
  output.print(`Managed by: ${describeManager(context)}\n`);

  if (context.manager === 'installer') {
    if (context.prBuild) {
      const sha = context.prBuild.sha
        ? ` (${context.prBuild.sha.slice(0, 12)})`
        : '';
      output.print(
        `Build: PR #${context.prBuild.number}${sha} — a mutable pre-release build, not the v${context.version} release\n`
      );
    } else if (
      context.linkedVersion &&
      context.linkedVersion !== context.version
    ) {
      output.print(`Linked version: ${context.linkedVersion}\n`);
    }
    if (context.pinnedVersion) {
      output.print(
        `Pinned: yes (${context.pinnedVersion}) — automatic updates and update notices are paused until you run ${getCommandName('version use latest')}\n`
      );
    }
  } else {
    output.print(`Upgrade command: ${context.upgradeCommand}\n`);
    output.print(
      `Tip: the recommended way to manage the Vercel CLI is the installer: ${CURL_INSTALL_COMMAND}\n`
    );
  }

  const autoUpdates = isAutoUpdateEnabled(client.config);
  const pinnedNote =
    autoUpdates && context.manager === 'installer' && context.pinnedVersion;
  output.print(
    `Automatic updates: ${autoUpdates ? 'Enabled' : 'Disabled'}${pinnedNote ? ' (paused while pinned)' : ''}\n`
  );

  return 0;
}
