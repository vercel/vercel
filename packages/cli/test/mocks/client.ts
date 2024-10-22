const originalCwd = process.cwd();
import { afterAll, beforeAll, afterEach } from 'vitest';

// Register Jest matcher extensions for CLI unit tests
import './matchers';

import chalk from 'chalk';
import { PassThrough } from 'stream';
import { createServer, Server } from 'http';
import express, { Express, Router } from 'express';
import { listen } from 'async-listen';
import Client from '../../src/util/client';
import stripAnsi from 'strip-ansi';
import ansiEscapes from 'ansi-escapes';
import { TelemetryEventStore } from '../../src/util/telemetry';

import output from '../../src/output-manager';

const ignoredAnsi = new Set([ansiEscapes.cursorHide, ansiEscapes.cursorShow]);

// Disable colors in `chalk` so that tests don't need
// to worry about ANSI codes
chalk.level = 0;

export type Scenario = Router;

class MockStream extends PassThrough {
  isTTY: boolean;
  #_fullOutput: string = '';
  #_chunks: Array<string> = [];
  #_rawChunks: Array<string> = [];

  constructor() {
    super();
    this.isTTY = true;
  }

  // These are for the `ora` module
  clearLine() {}
  cursorTo() {}

  override _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null | undefined) => void
  ): void {
    const str = chunk.toString();

    this.#_fullOutput += str;

    // There's some ANSI Inquirer just send to keep state of the terminal clear; we'll ignore those since they're
    // unlikely to be used by end users or part of prompt code.
    if (!ignoredAnsi.has(str)) {
      this.#_rawChunks.push(str);
    }

    // Stripping the ANSI codes here because Inquirer will push commands ANSI (like cursor move.)
    // This is probably fine since we don't care about those for testing; but this could become
    // an issue if we ever want to test for those.
    if (stripAnsi(str).trim().length > 0) {
      this.#_chunks.push(str);
    }
    super._write(chunk, encoding, callback);
  }

  getLastChunk({ raw }: { raw?: boolean }): string {
    const chunks = raw ? this.#_rawChunks : this.#_chunks;
    const lastChunk = chunks[chunks.length - 1];
    return lastChunk ?? '';
  }

  getFullOutput(): string {
    return this.#_fullOutput;
  }
}

class MockTelemetryEventStore extends TelemetryEventStore {
  save(): void {
    return;
  }
}

export class MockClient extends Client {
  stdin!: MockStream;
  stdout!: MockStream;
  stderr!: MockStream;
  scenario: Scenario;
  mockServer?: Server;
  private app: Express;

  constructor() {
    super({
      // Gets populated in `startMockServer()`
      apiUrl: '',
      // Gets re-initialized for every test in `reset()`
      argv: [],
      authConfig: {},
      config: {},
      localConfig: {},
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });

    this.telemetryEventStore = new MockTelemetryEventStore();

    this.app = express();
    this.app.use(express.json());

    // play scenario
    this.app.use((req, res, next) => {
      this.scenario(req, res, next);
    });

    // catch requests that were not intercepted
    this.app.use((req, res) => {
      const message = `[Vercel API Mock] \`${req.method} ${req.path}\` was not handled.`;
      // eslint-disable-next-line no-console
      console.warn(message);
      res.status(500).json({
        error: {
          code: 'not_found',
          message,
        },
      });
    });

    this.scenario = Router();

    this.reset();
  }

  reset() {
    this.stdin = new MockStream();

    this.stdout = new MockStream();
    this.stdout.setEncoding('utf8');
    this.stdout.end = () => this.stdout;
    this.stdout.pause();

    this.stderr = new MockStream();
    this.stderr.setEncoding('utf8');
    this.stderr.end = () => this.stderr;
    this.stderr.pause();
    this.stderr.isTTY = true;

    output.initialize({
      stream: this.stderr,
      supportsHyperlink: false,
      noColor: true,
    });

    this.argv = [];
    this.authConfig = {
      token: 'token_dummy',
    };
    this.config = {};
    this.localConfig = {};
    this.localConfigPath = undefined;

    this.scenario = Router();

    this.agent?.destroy();
    this.agent = undefined;

    this.cwd = originalCwd;
    this.telemetryEventStore.reset();
  }

  events = {
    keypress(
      key:
        | string
        | {
            name?: string | undefined;
            ctrl?: boolean | undefined;
            meta?: boolean | undefined;
            shift?: boolean | undefined;
          }
    ) {
      if (typeof key === 'string') {
        client.stdin.emit('keypress', null, { name: key });
      } else {
        client.stdin.emit('keypress', null, key);
      }
    },
    type(text: string) {
      client.stdin.write(text);
      for (const char of text) {
        client.stdin.emit('keypress', null, { name: char });
      }
    },
  };

  getScreen({ raw }: { raw?: boolean } = {}): string {
    const stderr = client.stderr;
    const lastScreen = stderr.getLastChunk({ raw });
    return raw ? lastScreen : stripAnsi(lastScreen).trim();
  }

  getFullOutput(): string {
    const stderr = client.stderr;
    return stderr.getFullOutput();
  }

  async startMockServer() {
    this.mockServer = createServer(this.app);
    await listen(this.mockServer, 0);
    const address = this.mockServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unexpected http server address');
    }
    this.apiUrl = `http://127.0.0.1:${address.port}`;
  }

  stopMockServer() {
    return new Promise<void>((resolve, reject) => {
      if (!this.mockServer?.close) {
        reject(new Error(`mockServer did not exist when closing`));
        return;
      }

      this.mockServer.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  setArgv(...argv: string[]) {
    this.argv = [process.execPath, 'cli.js', ...argv];

    output.initialize({
      debug: argv.includes('--debug') || argv.includes('-d'),
      noColor: argv.includes('--no-color'),
      supportsHyperlink: false,
    });
  }

  resetOutput() {
    output.initialize({
      debug: false,
      noColor: false,
      supportsHyperlink: true,
    });
  }

  useScenario(scenario: Scenario) {
    this.scenario = scenario;
  }
}

export const client = new MockClient();

beforeAll(async () => {
  await client.startMockServer();
});

afterEach(async context => {
  let extraError;

  if (context.task.result?.state === 'fail') {
    const stderr = client.stderr.getFullOutput() || '(none)';
    const stdout = client.stdout.getFullOutput() || '(none)';

    // we have to capture this data before calling `client.reset()`
    extraError = `(retrieving command output because of test failure)\n\n[STDERR]\n${stderr}\n\n[STDOUT]\n${stdout}`;
  }

  client.reset();

  if (extraError) {
    // we want to throw this after calling `client.reset()`
    // so the next test has a clear state
    throw new Error(extraError);
  }
});

afterAll(async () => {
  await client.stopMockServer();
});
