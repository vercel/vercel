// Register Jest matcher extensions for CLI unit tests
import './matchers';

import chalk from 'chalk';
import { PassThrough } from 'stream';
import { createServer, Server } from 'http';
import express, { Express, Router } from 'express';
import listen from 'async-listen';
import Client from '../../src/util/client';
import { Output } from '../../src/util/output';

// Disable colors in `chalk` so that tests don't need
// to worry about ANSI codes
chalk.level = 0;

export type Scenario = Router;

class MockStream extends PassThrough {
  isTTY: boolean;

  constructor() {
    super();
    this.isTTY = true;
  }

  // These is for the `ora` module
  clearLine() {}
  cursorTo() {}
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
      output: new Output(new PassThrough()),
    });

    this.app = express();
    this.app.use(express.json());

    // play scenario
    this.app.use((req, res, next) => {
      this.scenario(req, res, next);
    });

    // catch requests that were not intercepted
    this.app.use((req, res) => {
      const message = `[Vercel API Mock] \`${req.method} ${req.path}\` was not handled.`;
      console.warn(message);
      res.status(404).json({
        error: {
          code: 'not_found',
          message,
        },
      });
    });

    this.scenario = Router();
  }

  reset() {
    this.stdin = new MockStream();

    this.stdout = new MockStream();
    this.stdout.setEncoding('utf8');
    this.stdout.end = () => {};
    this.stdout.pause();

    this.stderr = new MockStream();
    this.stderr.setEncoding('utf8');
    this.stderr.end = () => {};
    this.stderr.pause();
    this.stderr.isTTY = true;

    this._createPromptModule();

    this.output = new Output(this.stderr);

    this.argv = [];
    this.authConfig = {
      token: 'token_dummy',
    };
    this.config = {};
    this.localConfig = {};

    this.scenario = Router();
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
  }

  useScenario(scenario: Scenario) {
    this.scenario = scenario;
  }
}

export const client = new MockClient();

beforeAll(async () => {
  await client.startMockServer();
});

beforeEach(() => {
  client.reset();
});

afterAll(async () => {
  await client.stopMockServer();
});
