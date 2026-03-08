import init from '../../../../src/commands/init';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import type { FetchOptions } from '../../../../src/util/client';
import fs from 'fs-extra';
import { join } from 'path';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { MockInstance } from 'vitest';

// path to mock tar
const mockPath = join(
  process.cwd(),
  'test',
  'mocks',
  'example-list-tars',
  'astro.tar.gz'
);

let mock: MockInstance<
  (url: string, options?: FetchOptions) => Promise<unknown>
>;
beforeEach(() => {
  // The examples list endpoint comes from an API that we don't typically mock
  mock = vi.spyOn(client, 'fetch').mockImplementation(async url => {
    const url2 = new URL(url);
    if (url2.pathname === '/v2/list.json') {
      return Promise.resolve([
        { name: 'angular', visible: true, suggestions: [] },
        { name: 'astro', visible: true, suggestions: [] },
      ]);
    }
    if (url2.pathname === '/v2/download/astro.tar.gz') {
      return new Response(fs.readFileSync(mockPath), {
        status: 200,
      });
    }
    throw new Error(`Unexpected fetch request for url ${url}`);
  });
});

describe('init', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'init';

      client.setArgv(command, '--help');
      const exitCodePromise = init(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('should allow selecting a framework to download the source into the expected folder', async () => {
    const cwd = setupTmpDir();
    client.cwd = cwd;

    const exitCodePromise = init(client);

    client.stdin.write('\x1B[B'); // Down arrow
    client.stdin.write('\r'); // Return key to select astro

    await expect(client.stderr).toOutput(`Fetching astro`);
    expect(mock).toHaveBeenCalled();

    await expect(client.stderr).toOutput(
      `Success! Initialized "astro" example`
    );

    const promiseResult = await exitCodePromise;
    expect(promiseResult).toEqual(0);
    const contents = await fs.readdirSync(join(cwd, 'astro'));
    expect(contents).toContain('package.json');
  });
  describe('when stdin is not a TTY', () => {
    it('should exit 0 with a helpful message when no framework argument is provided', async () => {
      const cwd = setupTmpDir();
      client.stdin.isTTY = false;
      client.cwd = cwd;

      client.setArgv('init');
      const exitCodePromise = init(client);

      await expect(client.stderr).toOutput(`No framework provided`);
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "init"').toEqual(0);
    });
    it("should exit 1 with a helpful message when the framework isn't found", async () => {
      const cwd = setupTmpDir();
      client.stdin.isTTY = false;
      client.cwd = cwd;

      client.setArgv('init', 'astroz');
      const exitCodePromise = init(client);

      await expect(client.stderr).toOutput(`No example found`);
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "init"').toEqual(1);
    });
  });
  describe('providing the [example] argument', () => {
    it('should track use of `dir` positional argument', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;

      client.setArgv('init', 'astro');
      const exitCodePromise = init(client);

      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:example',
          value: 'astro',
        },
      ]);
    });

    it('should succeed', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;

      client.setArgv('init', 'astro');
      const exitCodePromise = init(client);

      await expect(client.stderr).toOutput(`Fetching astro`);
      expect(mock).toHaveBeenCalled();

      const promiseResult = await exitCodePromise;
      expect(promiseResult).toEqual(0);

      const contents = await fs.readdirSync(join(cwd, 'astro'));
      expect(contents).toContain('package.json');
      expect(contents).toContain('astro.config.mjs');
    });

    describe('providing the [dir] argument', () => {
      it('should track use of `dir` positional argument', async () => {
        const cwd = setupTmpDir();
        client.cwd = cwd;

        const targetDirectory = 'my-astro';

        client.setArgv('init', 'astro', targetDirectory);
        const exitCodePromise = init(client);

        await expect(exitCodePromise).resolves.toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'argument:dir',
            value: '[REDACTED]',
          },
          {
            key: 'argument:example',
            value: 'astro',
          },
        ]);
      });

      it('should succeed', async () => {
        const cwd = setupTmpDir();
        client.cwd = cwd;

        const targetDirectory = 'my-astro';

        client.setArgv('init', 'astro', targetDirectory);
        const exitCodePromise = init(client);

        await expect(client.stderr).toOutput(`Fetching astro`);
        expect(mock).toHaveBeenCalled();

        const promiseResult = await exitCodePromise;
        expect(promiseResult).toEqual(0);

        const contents = await fs.readdirSync(join(cwd, targetDirectory));
        expect(contents).toContain('package.json');
        expect(contents).toContain('astro.config.mjs');
      });
    });
    it('should fail when a file matching the framework already exists in the target location', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;

      // Create a file at the expected destination...
      await fs.outputFile(
        join(cwd, 'astro'),
        JSON.stringify({ name: 'some-package' })
      );

      client.setArgv('init', 'astro');
      const exitCodePromise = init(client);

      await expect(client.stderr).toOutput(
        `Destination path "astro" already exists and is not a directory.`
      );
      expect(mock).toHaveBeenCalled();
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "init"').toEqual(1);
    });
    it('should fail when a non-empty folder matching the framework already exists in the target location', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;

      // Create a folder with some content at the expected destination...
      await fs.outputFile(
        join(cwd, 'astro', 'package.json'),
        JSON.stringify({ name: 'some-package' })
      );

      client.setArgv('init', 'astro');
      const exitCodePromise = init(client);

      await expect(client.stderr).toOutput(
        `Destination path "astro" already exists and is not an empty directory`
      );
      expect(mock).toHaveBeenCalled();
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "init"').toEqual(1);
    });
    it('should succeed when an empty folder matching the framework already exists in the target location', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;

      await fs.mkdirSync(join(cwd, 'astro'));
      client.setArgv('init', 'astro');
      const exitCodePromise = init(client);

      await expect(client.stderr).toOutput(`Fetching astro`);
      expect(mock).toHaveBeenCalled();

      const promiseResult = await exitCodePromise;
      expect(promiseResult).toEqual(0);

      const contents = await fs.readdirSync(join(cwd, 'astro'));
      expect(contents).toContain('package.json');
    });
    it("should fail when providing the framework argument which is so incorrect that it can't be guessed", async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;

      const frameworkName = 'some-unguessable-framework-name';
      client.setArgv('init', frameworkName);
      const exitCodePromise = init(client);

      await expect(client.stderr).toOutput(
        `No example found for ${frameworkName}, run \`vercel init\` to see the list of available examples.`
      );
      expect(mock).toHaveBeenCalled();
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "init"').toEqual(1);
    });
    describe('--force', () => {
      it('should fail when a file matching the framework already exists in the target location', async () => {
        const cwd = setupTmpDir();
        client.cwd = cwd;

        // Create a file at the expected destination...
        await fs.outputFile(
          join(cwd, 'astro'),
          JSON.stringify({ name: 'some-package' })
        );

        client.setArgv('init', 'astro', '--force');
        const exitCodePromise = init(client);

        await expect(client.stderr).toOutput(
          `Destination path "astro" already exists and is not a directory.`
        );
        expect(mock).toHaveBeenCalled();
        const exitCode = await exitCodePromise;
        expect(exitCode, 'exit code for "init"').toEqual(1);
      });
      it('should succeed when a non-empty folder matching the framework already exists in the target location', async () => {
        const cwd = setupTmpDir();
        client.cwd = cwd;

        // Create a folder with some content at the expected destination...
        await fs.outputFile(
          join(cwd, 'astro', 'package.json'),
          JSON.stringify({ name: 'some-package' })
        );

        client.stderr.pipe(process.stderr);
        client.setArgv('init', 'astro', '--force');
        const exitCodePromise = init(client);

        await expect(client.stderr).toOutput(
          `Success! Initialized "astro" example`
        );

        const promiseResult = await exitCodePromise;
        expect(promiseResult).toEqual(0);

        const contents = await fs.readdirSync(join(cwd, 'astro'));
        expect(contents).toContain('package.json');
      });

      it('should track use of `--force` flag', async () => {
        const cwd = setupTmpDir();
        client.cwd = cwd;

        client.setArgv('init', 'astro', '--force');
        const exitCodePromise = init(client);

        await expect(exitCodePromise).resolves.toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'flag:force',
            value: 'TRUE',
          },
          {
            key: 'argument:example',
            value: 'astro',
          },
        ]);
      });
    });
  });
  describe('triggering the guess prompt with by incorrectly spelling "astroz"', () => {
    it('should succeed when accepting the suggestion', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;

      client.setArgv('init', 'astroz');
      const exitCodePromise = init(client);

      await expect(client.stderr).toOutput('? Did you mean astro? (y/N)');
      client.stdin.write('y');
      client.stdin.write('\r'); // Return key

      await expect(client.stderr).toOutput(`Fetching astro`);
      expect(mock).toHaveBeenCalled();

      const promiseResult = await exitCodePromise;
      expect(promiseResult).toEqual(0);

      const contents = await fs.readdirSync(join(cwd, 'astro'));
      expect(contents).toContain('package.json');
    });
    it('should fail when rejecting the suggestion', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;

      client.setArgv('init', 'astroz');
      const exitCodePromise = init(client);

      await expect(client.stderr).toOutput('? Did you mean astro? (y/N)');

      client.stdin.write('\r'); // Return key
      await expect(client.stderr).toOutput(`> No changes made`);
      expect(mock).toHaveBeenCalled();

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "init"').toEqual(0);
    });
    it('should track when accepting the suggestion with redacted value', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;

      client.setArgv('init', 'astroz');
      const exitCodePromise = init(client);

      await expect(client.stderr).toOutput('? Did you mean astro? (y/N)');
      client.stdin.write('y');
      client.stdin.write('\r'); // Return key

      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:example',
          value: '[REDACTED]',
        },
      ]);
    });
  });
});
