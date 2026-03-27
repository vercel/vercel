import chalk from 'chalk';
import { resolve, join } from 'path';
import fs from 'fs-extra';
import type { ResolvedService } from '@vercel/fs-detectors';
import {
  TUI,
  ProcessTerminal,
  Text,
  Input,
  Spacer,
} from '@mariozechner/pi-tui';

import DevServer from '../../util/dev/server';
import { parseListen } from '../../util/dev/parse-listen';
import type Client from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';
import type { ProjectSettings } from '@vercel-internals/types';
import setupAndLink from '../../util/link/setup-and-link';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import param from '../../util/output/param';
import { OUTPUT_DIR } from '../../util/build/write-build-result';
import { pullEnvRecords } from '../../util/env/get-env-records';
import output from '../../output-manager';
import { refreshOidcToken } from '../../util/env/refresh-oidc-token';
import {
  outputActionRequired,
  buildCommandWithYes,
} from '../../util/agent-output';
import type { DevTelemetryClient } from '../../util/telemetry/commands/dev';
import { VERCEL_OIDC_TOKEN } from '../../util/env/constants';
import { tryDetectServices } from '../../util/projects/detect-services';
import { displayDetectedServices } from '../../util/input/display-services';
import { acquireDevLock, releaseDevLock } from '../../util/dev/dev-lock';
import { resolveProjectCwd } from '../../util/projects/find-project-root';

type Options = {
  '--listen': string;
  '--local': boolean;
  '--yes': boolean;
  '--agent': boolean;
};

export async function startAgentMode(
  client: Client,
  opts: Partial<Options>,
  args: string[],
  telemetry: DevTelemetryClient
): Promise<number> {
  // Save original writes before anything else — the TUI terminal
  // needs these to render directly to the real terminal.
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  // Set up TUI
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  const outputPanel = new Text('', 0, 0);
  const spacer = new Spacer(1);
  const inputPanel = new Input();

  tui.addChild(outputPanel);
  tui.addChild(spacer);
  tui.addChild(inputPanel);
  tui.setFocus(inputPanel);

  let outputBuffer = '';

  function appendOutput(text: string) {
    outputBuffer += text;
    outputPanel.setText(outputBuffer);
    tui.requestRender();
  }

  // Placeholder: echo user input to output panel
  inputPanel.onSubmit = (value: string) => {
    appendOutput(`\n${chalk.cyan('>')} ${value}\n`);
    inputPanel.setValue('');
  };

  // Start the TUI first (terminal.start sets up raw mode, bracketed paste,
  // kitty protocol — all using the still-unpatched process.stdout.write).
  tui.start();

  // Now override ALL terminal output methods to use the saved original write.
  // ProcessTerminal hardcodes process.stdout.write in every method, so we
  // must bypass our upcoming intercept for every one of them.
  terminal.write = (data: string) => {
    originalStdoutWrite(data);
  };
  terminal.hideCursor = () => {
    originalStdoutWrite('\x1b[?25l');
  };
  terminal.showCursor = () => {
    originalStdoutWrite('\x1b[?25h');
  };
  terminal.clearLine = () => {
    originalStdoutWrite('\x1b[K');
  };
  terminal.clearFromCursor = () => {
    originalStdoutWrite('\x1b[J');
  };
  terminal.clearScreen = () => {
    originalStdoutWrite('\x1b[2J\x1b[H');
  };
  terminal.moveBy = (lines: number) => {
    if (lines > 0) {
      originalStdoutWrite(`\x1b[${lines}B`);
    } else if (lines < 0) {
      originalStdoutWrite(`\x1b[${-lines}A`);
    }
  };
  terminal.setTitle = (title: string) => {
    originalStdoutWrite(`\x1b]0;${title}\x07`);
  };

  // Intercept stdout/stderr to route dev server output to the TUI panel.
  // The TUI's terminal methods above bypass this by using originalStdoutWrite.
  function interceptIO() {
    process.stdout.write = (
      chunk: string | Uint8Array,
      encodingOrCb?: BufferEncoding | ((err?: Error) => void),
      cb?: (err?: Error) => void
    ): boolean => {
      const text =
        typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      appendOutput(text);
      const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
      if (callback) {
        callback();
      }
      return true;
    };

    process.stderr.write = (
      chunk: string | Uint8Array,
      encodingOrCb?: BufferEncoding | ((err?: Error) => void),
      cb?: (err?: Error) => void
    ): boolean => {
      const text =
        typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      appendOutput(text);
      const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
      if (callback) {
        callback();
      }
      return true;
    };
  }

  interceptIO();
  appendOutput(`${chalk.bold('Vercel Dev')} ${chalk.dim('(agent mode)')}\n\n`);

  // Restore stdout/stderr and stop TUI on cleanup
  function restoreIO() {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }

  // --- Dev server setup (mirrors dev.ts logic) ---

  const [dir = '.'] = args;
  let cwd = resolve(dir);
  const listen = parseListen(opts['--listen'] || '3000');

  cwd = await resolveProjectCwd(cwd);

  let link = await getLinkedProject(client, cwd);

  if (link.status === 'not_linked' && !process.env.__VERCEL_SKIP_DEV_CMD) {
    if (opts['--local']) {
      appendOutput(
        chalk.yellow('WARNING!') +
          ' Running dev server in local mode without a project setup:\n' +
          '  - Environment variables will not be pulled from Vercel\n' +
          '  - Project settings are defined by local configuration\n\n' +
          `To link your project, run ${getCommandName('dev')} without \`-L\` or \`--local\` or ${getCommandName('link')}.\n`
      );
    } else {
      // Need to restore IO for interactive prompts
      restoreIO();
      tui.stop();
      link = await setupAndLink(client, cwd, {
        autoConfirm: opts['--yes'],
        link,
        successEmoji: 'link',
        setupMsg: 'Set up and develop',
        nonInteractive: client.nonInteractive,
      });
      if (link.status === 'not_linked') {
        return 0;
      }
      // Restart TUI before re-intercepting (start() uses process.stdout.write
      // directly for terminal setup escape sequences)
      tui.start();
      interceptIO();
    }
  }

  if (link.status === 'error') {
    if (link.reason === 'HEADLESS') {
      if (client.nonInteractive) {
        restoreIO();
        tui.stop();
        outputActionRequired(
          client,
          {
            status: 'action_required',
            reason: 'confirmation_required',
            message: `Command ${getCommandNamePlain('dev')} requires confirmation. Use option --yes to confirm.`,
            next: [
              {
                command: buildCommandWithYes(client.argv),
                when: 'Confirm and run',
              },
            ],
          },
          link.exitCode
        );
      } else {
        appendOutput(
          `${chalk.red('Error:')} Command ${getCommandName('dev')} requires confirmation. Use option ${param('--yes')} to confirm.\n`
        );
      }
    }
    restoreIO();
    tui.stop();
    return link.exitCode;
  }

  let projectSettings: ProjectSettings | undefined;
  let envValues: Record<string, string> = {};
  let repoRoot: string | undefined;
  if (link.status === 'linked') {
    const { project, org } = link;

    if (link.repoRoot) {
      repoRoot = cwd = link.repoRoot;
    }

    client.config.currentTeam = org.type === 'team' ? org.id : undefined;
    projectSettings = project;

    if (project.rootDirectory) {
      cwd = join(cwd, project.rootDirectory);
    }

    envValues = (await pullEnvRecords(client, project.id, 'vercel-cli:dev'))
      .env;
  }

  let services: ResolvedService[] | undefined;
  const servicesResult = await tryDetectServices(cwd);
  const foundServices = servicesResult && servicesResult.services.length > 0;
  if (foundServices) {
    displayDetectedServices(servicesResult.services);
    services = servicesResult.services;
  }

  let lockAcquired = false;
  if (foundServices) {
    const port = typeof listen[0] === 'number' ? listen[0] : 0;
    const lockResult = await acquireDevLock(cwd, port);

    if (!lockResult.acquired) {
      appendOutput(
        `${chalk.red('Error:')} Another ${getCommandName('dev')} process is already running for this project.\n`
      );
      restoreIO();
      tui.stop();
      return 1;
    }
    lockAcquired = true;
  }

  const devServer = new DevServer(cwd, {
    projectSettings,
    envValues,
    repoRoot,
    services,
  });

  const controller = new AbortController();
  const timeout = setTimeout(async () => {
    if (link.status !== 'linked') return;

    try {
      let refreshCount = 0;
      for await (const token of refreshOidcToken(
        controller.signal,
        client,
        link.project.id,
        envValues,
        'vercel-cli:dev'
      )) {
        output.debug(`Refreshing ${chalk.green(VERCEL_OIDC_TOKEN)}`);
        envValues[VERCEL_OIDC_TOKEN] = token;
        await devServer.runDevCommand(true);
        telemetry.trackOidcTokenRefresh(++refreshCount);
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        throw error;
      }
    }
  });

  let cleanupInProgress = false;
  const cleanup = async (signal: string) => {
    if (cleanupInProgress) return;
    cleanupInProgress = true;

    clearTimeout(timeout);
    controller.abort();

    if (lockAcquired) {
      releaseDevLock(cwd);
    }

    await devServer.stop();

    restoreIO();
    tui.stop();

    let exitCode = 0;
    switch (signal) {
      case 'SIGINT':
        exitCode = 130;
        break;
      case 'SIGTERM':
        exitCode = 143;
        break;
    }

    process.exit(exitCode);
  };

  process.on('SIGTERM', async () => await cleanup('SIGTERM'));
  process.on('SIGINT', async () => await cleanup('SIGINT'));

  if (!devServer.devCommand) {
    const outputDir = join(cwd, OUTPUT_DIR);
    if (await fs.pathExists(outputDir)) {
      appendOutput(`Removing ${OUTPUT_DIR}\n`);
      await fs.remove(outputDir);
    }
  }

  try {
    await devServer.start(...listen);
  } catch (err) {
    if (lockAcquired) {
      releaseDevLock(cwd);
    }
    restoreIO();
    tui.stop();
    throw err;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }

  return 0;
}
