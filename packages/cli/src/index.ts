import { isError } from '@vercel/error-utils';

try {
  // Test to see if cwd has been deleted before
  // importing 3rd party packages that might need cwd.
  process.cwd();
} catch (err: unknown) {
  if (isError(err) && err.message.includes('uv_cwd')) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error('Error: The current working directory does not exist.');
    process.exit(1);
  }
}

{
  const SILENCED_ERRORS = [
    'DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.',
  ];

  // biome-ignore lint/suspicious/noConsole: intentional console usage
  const originalError = console.error;
  console.error = (msg: unknown) => {
    const isSilencedError = SILENCED_ERRORS.some(
      error => typeof msg === 'string' && msg.includes(error)
    );
    if (isSilencedError) {
      return;
    }
    originalError(msg);
  };
}

import chalk from 'chalk';
import semver from 'semver';
import epipebomb from 'epipebomb';
import getLatestVersion, {
  fetchLatestVersion,
  updateLatestVersionCache,
} from './util/get-latest-version';
import { getSentry } from './util/get-sentry';
import pkg from './util/pkg';
import cmd from './util/output/cmd';
import type Client from './util/client';
import reportError from './util/report-error';
import getUpdateCommand from './util/get-update-command';
import { executeUpgrade } from './util/upgrade';
import {
  canAutoUpdate,
  hasAutoUpdatePreference,
  isNativeBinaryInstall,
  isVersionPinned,
  setAutoUpdate,
} from './util/updates';
import box from './util/output/box';
import output from './output-manager';
import { runCli } from './run-cli';
import { liveCliContext } from './gateways/live-context';

/*
  By default, node throws EPIPE errors if process.stdout is being written to
  and a user runs it through a pipe that gets closed while the process is still outputting
  (eg, the simple case of piping a node app through head).

  This suppresses those errors.
*/
epipebomb();

let client: Client;

// Register global error handlers early to catch errors during initialization.
// Sentry is lazily initialized only when an error actually occurs.
const handleRejection = async (err: any) => {
  if (err) {
    if (err instanceof Error) {
      await handleUnexpected(err);
    } else {
      output.error(`An unexpected rejection occurred\n  ${err}`);
      await reportError(await getSentry(), client, err);
    }
  } else {
    output.error('An unexpected empty rejection occurred');
  }

  process.exit(1);
};

const handleUnexpected = async (err: Error) => {
  const { message } = err;

  // We do not want to render errors about Sentry not being reachable
  if (message.includes('sentry') && message.includes('ENOTFOUND')) {
    output.debug(`Sentry is not reachable: ${err}`);
    return;
  }

  output.error(`An unexpected error occurred!\n${err.stack}`);
  await reportError(await getSentry(), client, err);

  process.exit(1);
};

process.on('unhandledRejection', handleRejection);
process.on('uncaughtException', handleUnexpected);

// Emit plugin hint when running inside Claude Code
if (process.env.CLAUDECODE) {
  process.stderr.write(
    '<claude-code-hint v="1" type="plugin" value="vercel@claude-plugins-official" />\n'
  );
}

// Snapshot before any command has a chance to mutate process.env
const SHOULD_CHECK_FOR_UPDATES =
  !process.env.NO_UPDATE_NOTIFIER && !process.env.VERCEL;

// Start the CLI update check early so the fresh registry lookup runs in
// parallel with the command, avoiding any perceived delay when the
// command finishes and the update prompt needs to appear.
//
// The notification is NOT consumed here so that if the command crashes, the
// notification cycle is preserved for the next run.
let cachedLatest: string | undefined;
let freshLookupPromise: Promise<string | undefined> | undefined;

if (SHOULD_CHECK_FOR_UPDATES && !isNativeBinaryInstall()) {
  cachedLatest = getLatestVersion({ pkg, consumeNotification: false });
  if (cachedLatest) {
    output.debug('Update may be available, fetching fresh version...');
    freshLookupPromise = fetchLatestVersion({
      name: pkg.name,
      timeout: 3000,
    }).catch(() => undefined);
  }
}

/**
 * Prompts the user to upgrade now and, if they accept, runs the upgrade
 * and optionally asks about enabling automatic updates.
 *
 * @returns The upgrade exit code if the user accepted, otherwise `undefined`.
 */
async function promptAndUpgrade(
  client: Client,
  targetVersion?: string
): Promise<number | undefined> {
  try {
    const shouldUpgrade = await client.input.confirm(
      'Would you like to upgrade now?',
      true
    );

    if (!shouldUpgrade) return;

    const upgradeExitCode = await executeUpgrade(targetVersion);
    if (upgradeExitCode === 0 && !hasAutoUpdatePreference(client.config)) {
      const enableAutoUpdates = await client.input.confirm(
        'Enable automatic CLI updates for future releases?',
        false
      );
      setAutoUpdate(client, enableAutoUpdates);
    }
    return upgradeExitCode;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes('User force closed the prompt')
    ) {
      // User pressed Ctrl+C to dismiss the prompt
      return;
    }
    throw err;
  }
}

runCli(
  {
    argv: process.argv,
    env: process.env,
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  },
  liveCliContext({ argv: process.argv, env: process.env }),
  {
    onClientCreated: c => {
      client = c;
    },
  }
)
  .then(async result => {
    const {
      exitCode,
      client: resultClient,
      resolvedCommand: resolvedCommandForUpdate,
      isTTY,
    } = result;
    // Skip the update notification after `vc upgrade`: the process still has
    // the pre-upgrade version in memory, so it would prompt the user to
    // upgrade again right after the upgrade completed.
    // Also skip it entirely while a version is pinned (`vc version use`):
    // the user explicitly chose this version, so don't nag or auto-update.
    if (
      cachedLatest &&
      resolvedCommandForUpdate !== 'upgrade' &&
      !(await isVersionPinned())
    ) {
      const originalExitCode = typeof exitCode === 'number' ? exitCode : 0;

      // Await the fresh registry lookup to verify the exact version before
      // presenting it. This is needed for both the auto-update and interactive paths.
      const fresh = freshLookupPromise ? await freshLookupPromise : undefined;
      output.debug(`Fresh lookup result: ${fresh ?? 'failed'}`);

      let latest: string | undefined;
      let userUpToDate = false;

      if (fresh) {
        updateLatestVersionCache({ name: pkg.name, version: fresh });

        if (semver.lt(pkg.version, fresh)) {
          latest = fresh;
        } else {
          // Cache was stale, user is already on the latest version
          userUpToDate = true;
        }
      }

      // Consume the notification cycle now that the command has completed
      // and we've determined the update status. If the command had crashed,
      // this code never runs and the notification is preserved for next time.
      getLatestVersion({ pkg });

      if (
        !userUpToDate &&
        resultClient &&
        (await canAutoUpdate(
          resultClient,
          originalExitCode,
          resolvedCommandForUpdate
        ))
      ) {
        const upgradeExitCode = await executeUpgrade();
        process.exitCode = originalExitCode;
        if (upgradeExitCode !== 0) {
          output.log(
            `Automatic update failed. Continuing with original exit code ${originalExitCode}.`
          );
        }
        return;
      }

      if (latest) {
        const changelog = `https://github.com/vercel/vercel/releases/tag/vercel%40${latest}`;

        if (isTTY) {
          // Interactive mode: prompt user to update now
          const errorMsg =
            exitCode && exitCode !== 2
              ? chalk.magenta(
                  ` The latest update ${chalk.italic(
                    'may'
                  )} fix any errors that occurred.`
                )
              : '';

          output.print(
            `\nUpdate available for Vercel CLI (${chalk.gray(
              `v${pkg.version}`
            )} → ${chalk.green(`v${latest}`)})${errorMsg}\n`
          );
          output.print(
            `Changelog: ${output.link(changelog, changelog, { fallback: false })}\n`
          );

          const upgradeExitCode = resultClient
            ? await promptAndUpgrade(resultClient, latest)
            : undefined;
          if (upgradeExitCode !== undefined) {
            process.exitCode = upgradeExitCode;
            return;
          }
        } else {
          const errorMsg =
            exitCode && exitCode !== 2
              ? chalk.magenta(
                  `\n\nThe latest update ${chalk.italic(
                    'may'
                  )} fix any errors that occurred.`
                )
              : '';
          output.print(
            box(
              `Update available! ${chalk.gray(`v${pkg.version}`)} ≫ ${chalk.green(
                `v${latest}`
              )}
Changelog: ${output.link(changelog, changelog, { fallback: false })}
Run ${chalk.cyan(cmd(await getUpdateCommand()))} to update.${errorMsg}`
            )
          );
          output.print('\n');
        }
        // If the fresh lookup failed we don't show the exact version.
      } else if (!fresh) {
        // Fresh lookup failed — show a generic update message without
        // naming a specific version, since the cached version may be stale.
        if (isTTY) {
          output.print('\nA newer version of Vercel CLI may be available.\n');

          const upgradeExitCode = resultClient
            ? await promptAndUpgrade(resultClient)
            : undefined;
          if (upgradeExitCode !== undefined) {
            process.exitCode = upgradeExitCode;
            return;
          }
        } else {
          output.print(
            box(
              `A newer version of Vercel CLI may be available.
Run ${chalk.cyan(cmd(await getUpdateCommand()))} to update.`
            )
          );
          output.print('\n');
        }
      }
      // else: userUpToDate — skip notification silently
    }

    process.exitCode = exitCode;
  })
  .catch(handleUnexpected);
