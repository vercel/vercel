import chalk from 'chalk';
import output from '../../output-manager';
import {
  CURL_INSTALL_COMMAND,
  getVersionContext,
} from '../../util/version-context';
import { listNativeTrackSlots } from '../../util/native-install-layout';

/** List the bounded slots managed by the native installer. */
export default async function installed(): Promise<number> {
  const context = await getVersionContext();

  if (context.manager !== 'installer') {
    const manager =
      context.packageManager === undefined
        ? 'an unsupported package-manager installation'
        : context.packageManager === 'homebrew'
          ? 'Homebrew'
          : context.packageManagerAssumed
            ? `${context.packageManager} (assumed)`
            : context.packageManager;
    output.print(`${context.version} ${chalk.dim('(current)')}\n`);
    output.log(
      `This CLI is managed by ${manager}, so only the current version is available. ` +
        `The recommended way to manage CLI versions is the installer: ${CURL_INSTALL_COMMAND}`
    );
    return 0;
  }

  const slots = await listNativeTrackSlots(context.installRoot);
  if (slots.length === 0) {
    output.log('No slot-managed versions found');
    return 0;
  }

  for (const installed of slots) {
    const active =
      installed.track === context.track && installed.slot === context.slot;
    const build = installed.pr
      ? `PR #${installed.pr}${installed.buildSha ? ` (${installed.buildSha.slice(0, 12)})` : ''}`
      : `v${installed.version}`;
    output.print(
      `${installed.track}/${installed.slot} ${build}${active ? ` ${chalk.dim('(active)')}` : ''}\n`
    );
  }
  return 0;
}
