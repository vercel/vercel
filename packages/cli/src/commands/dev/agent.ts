import chalk from 'chalk';
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

  inputPanel.onSubmit = (value: string) => {
    appendOutput(`user said: ${value}\n`);
    inputPanel.setValue('');
  };

  // Start the TUI first (terminal.start sets up raw mode, bracketed paste,
  // kitty protocol — all using the still-unpatched process.stdout.write).
  tui.start();

  // Override ALL terminal output methods to use the saved original write.
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

  function restoreIO() {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }

  async function shutdown() {
    restoreIO();
    // Drain any leftover input bytes (e.g. Ctrl+D) while stdin is still
    // in raw mode, before tui.stop() switches back to cooked mode —
    // otherwise the bytes leak to the parent shell.
    await terminal.drainInput(200, 50);
    tui.stop();
  }

  interceptIO();
  appendOutput(`${chalk.bold('Vercel Dev')} ${chalk.dim('(agent mode)')}\n\n`);

  const ctx: DevContext = {
    willPrompt() {
      restoreIO();
      tui.stop();
    },
    didPrompt() {
      tui.start();
      interceptIO();
    },
    onCleanupReady(cleanup) {
      tui.addInputListener((data: string) => {
        if (matchesKey(data, 'ctrl+c') || matchesKey(data, 'ctrl+d')) {
          cleanup();
          return { consume: true };
        }
        return undefined;
      });
    },
    onShutdown: shutdown,
  };

  return startDevServer(client, opts, args, telemetry, ctx);
}
