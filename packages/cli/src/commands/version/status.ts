import output from '../../output-manager';
import type Client from '../../util/client';
import { isAutoUpdateEnabled } from '../../util/updates';
import { isNativeAutoUpdateEnabled } from './native-auto-update';
import {
  describeManager,
  describeRuntime,
  getVersionContext,
} from '../../util/version-context';

/** Show the active CLI and how it is installed and updated. */
export default async function status(client: Client): Promise<number> {
  const context = await getVersionContext();

  output.print(`Version: ${context.version}\n`);
  output.print(`Runtime: ${describeRuntime(context)}\n`);
  output.print(`Managed by: ${describeManager(context)}\n`);

  if (context.manager === 'installer') {
    output.print(
      `Active version: ${context.activeVersion ?? context.version}\n`
    );
    if (context.prBuild) {
      const sha = context.prBuild.sha
        ? ` (${context.prBuild.sha.slice(0, 12)})`
        : '';
      output.print(`Active build: PR #${context.prBuild.number}${sha}\n`);
    }
    if (context.pendingProduction) {
      output.print(
        `Pending production: ${context.pendingProduction.version} (production/${context.pendingProduction.slot})\n`
      );
    }
    output.print(
      `Automatic updates: ${isNativeAutoUpdateEnabled(client.config) ? 'Enabled' : 'Disabled'}\n`
    );
  } else {
    if (context.upgradeCommand !== undefined) {
      output.print(`Upgrade command: ${context.upgradeCommand}\n`);
    } else {
      output.print(`${context.upgradeError.message}\n`);
    }
    output.print(
      `Automatic updates: ${isAutoUpdateEnabled(client.config) ? 'Enabled' : 'Disabled'}\n`
    );
  }

  return 0;
}
