import { createServer, Server } from 'http';
import express, { Express, Router } from 'express';
import listen from 'async-listen';
import Client from '../../src/util/client';
import { Output } from '../../src/util/output';

export type Scenario = Router;

export class MockClient extends Client {
  mockServer?: Server;
  mockOutput: jest.Mock<void, Parameters<Output['print']>>;
  private app: Express;
  scenario: Scenario;

  constructor() {
    super({
      argv: [],
      // Gets populated in `startMockServer()`
      apiUrl: '',
      authConfig: {},
      output: new Output(),
      config: {},
      localConfig: {},
    });
    this.mockOutput = jest.fn();

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
    this.output = new Output();
    this.mockOutput = jest.fn();
    this.output.print = this.mockOutput;

    this.argv = [];
    this.authConfig = {};
    this.config = {};
    this.localConfig = {};

    // Just make this one silent
    this.output.spinner = () => {};

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
    this.mockServer?.close();
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

afterAll(() => {
  client.stopMockServer();
});
