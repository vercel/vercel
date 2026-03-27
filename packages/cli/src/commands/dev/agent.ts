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

const ANSI_RE = /\x1b\[[0-9;]*m/g;
const SERVICE_PREFIX_RE = /^\[([^\]]+)\]/;
const ERROR_LINE_RE = /^\[([^\]]+)\]\s+ERROR:/;

function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, '');
}

type ErrorChunkCallback = (text: string) => void;

class ErrorChunker {
  private lineBuffer = '';
  private collecting: {
    serviceName: string;
    lines: string[];
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor(private onChunk: ErrorChunkCallback) {}

  feed(text: string) {
    this.lineBuffer += text;
    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop() || '';

    for (const line of lines) {
      this.processLine(line + '\n');
    }
  }

  dispose() {
    this.flush();
  }

  private processLine(line: string) {
    const stripped = stripAnsi(line);
    const errorMatch = stripped.match(ERROR_LINE_RE);

    if (errorMatch) {
      // New error block — flush any previous collection first
      this.flush();
      this.collecting = {
        serviceName: errorMatch[1],
        lines: [line],
        timer: setTimeout(() => this.flush(), 500),
      };
      return;
    }

    if (this.collecting) {
      const serviceMatch = stripped.match(SERVICE_PREFIX_RE);
      if (serviceMatch && serviceMatch[1] !== this.collecting.serviceName) {
        // Different service — flush collected error chunk
        this.flush();
      } else {
        // Same service or no service prefix — keep collecting
        this.collecting.lines.push(line);
      }
    }
  }

  private flush() {
    if (!this.collecting) return;
    clearTimeout(this.collecting.timer);
    const text = this.collecting.lines.join('');
    this.collecting = null;
    this.onChunk(text);
  }
}

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

  const errorChunker = new ErrorChunker((text: string) => {
    // TODO: Replace with actual agent callback
    appendOutput(chalk.green(`[error chunk]\n${text}`));
  });

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
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      appendOutput(text);
      errorChunker.feed(text);
      callback();
    },
  });

  appendOutput(`${chalk.bold('Vercel Dev')} ${chalk.dim('(agent mode)')}\n\n`);

  // Teardown follows the pi-agent pattern: drain stdin, then stop TUI.
  let tornDown = false;
  async function teardownTUI() {
    if (tornDown) return;
    tornDown = true;
    errorChunker.dispose();
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
