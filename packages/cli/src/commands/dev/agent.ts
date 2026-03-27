import chalk from 'chalk';
import { Writable } from 'stream';
import {
  TUI,
  ProcessTerminal,
  Text,
  Input,
  Spacer,
  matchesKey,
} from '@mariozechner/pi-tui';

import type Client from '../../util/client';
import type { DevTelemetryClient } from '../../util/telemetry/commands/dev';
import { startDevServer, type DevContext, type DevOptions } from './dev-server';

export async function startAgentMode(
  client: Client,
  opts: Partial<DevOptions>,
  args: string[],
  telemetry: DevTelemetryClient
): Promise<number> {
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

  inputPanel.onSubmit = (value: string) => {
    appendOutput(`user said: ${value}\n`);
    inputPanel.setValue('');
  };

  tui.start();

  // Writable stream that feeds into the TUI output panel.
  // Passed to DevServer so child process output goes here
  // instead of directly to process.stdout/stderr.
  const tuiStream = new Writable({
    write(chunk, _encoding, callback) {
      appendOutput(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      callback();
    },
  });

  appendOutput(`${chalk.bold('Vercel Dev')} ${chalk.dim('(agent mode)')}\n\n`);

  // Teardown follows the pi-agent pattern: drain stdin, then stop TUI.
  let tornDown = false;
  async function teardownTUI() {
    if (tornDown) return;
    tornDown = true;
    await new Promise<void>(resolve => process.nextTick(resolve));
    await terminal.drainInput(1000);
    tui.stop();
  }

  const ctx: DevContext = {
    stdout: tuiStream,
    stderr: tuiStream,
    willPrompt() {
      tornDown = true;
      tui.stop();
    },
    didPrompt() {
      tornDown = false;
      tui.start();
    },
    onCleanupReady(cleanup) {
      tui.addInputListener((data: string) => {
        if (matchesKey(data, 'ctrl+c') || matchesKey(data, 'ctrl+d')) {
          teardownTUI().then(() => cleanup());
          return { consume: true };
        }
        return undefined;
      });
    },
    onShutdown: teardownTUI,
  };

  return startDevServer(client, opts, args, telemetry, ctx);
}
