import { describe, expect, it, beforeEach, vi } from 'vitest';
import { client } from '../../../mocks/client';
import redirects from '../../../../src/commands/redirects';
import { help } from '../../../../src/commands/help';
import {
  redirectsCommand,
  uploadSubcommand,
} from '../../../../src/commands/redirects/command';
import { useUser } from '../../../mocks/user';
import { useProject, defaultProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

describe('redirects upload', () => {
  let fixtureDir: string;

  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      id: 'redirects-test',
      name: 'redirects-test',
    });
    client.scenario.get('/v9/projects/:projectNameOrId', (_req, res) => {
      res.json(project);
    });
    const cwd = setupUnitFixture('commands/redirects');
    client.cwd = cwd;

    fixtureDir = join(cwd, 'fixtures');
    mkdirSync(fixtureDir, { recursive: true });

    client.scenario.get('/v1/bulk-redirects/versions', (_req, res) => {
      res.json({ versions: [] });
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'redirects';
      const subcommand = 'upload';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = redirects(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  describe('CSV upload', () => {
    it('should upload redirects from CSV file', async () => {
      const csvPath = join(fixtureDir, 'test.csv');
      const csvContent = `source,destination,statusCode
/old-path,/new-path,301
/another,/dest,302`;
      writeFileSync(csvPath, csvContent);

      client.scenario.put('/v1/bulk-redirects', (_req, res) => {
        res.json({
          alias: 'test-alias.vercel.app',
          version: {
            id: 'version-1',
            name: 'Upload Version',
          },
          redirectsCount: 2,
          count: 2,
        });
      });

      client.scenario.get('/v1/bulk-redirects', (req, res) => {
        const versionId = req.query.versionId;
        const diff = req.query.diff;
        if (versionId === 'version-1' && diff === 'only') {
          res.json({
            redirects: [
              {
                source: '/old-path',
                destination: '/new-path',
                statusCode: 301,
                action: '+',
              },
              {
                source: '/another',
                destination: '/dest',
                statusCode: 302,
                action: '+',
              },
            ],
          });
        } else {
          res.json({ redirects: [] });
        }
      });

      client.setArgv('redirects', 'upload', csvPath, '--yes');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Importing redirects');
      await expect(client.stderr).toOutput('Redirects imported');
      await expect(client.stderr).toOutput('Imported 2 redirects');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should prompt for confirmation without --yes flag', async () => {
      const csvPath = join(fixtureDir, 'test.csv');
      const csvContent = `source,destination
/path1,/dest1`;
      writeFileSync(csvPath, csvContent);

      mockPutRedirects({ redirectCount: 1 });

      client.setArgv('redirects', 'upload', csvPath);
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Import CSV file "test.csv"?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Do you want to provide a name for this version?'
      );
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('This is the only staged change');
      client.stdin.write('n\n');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should handle upload cancellation', async () => {
      const csvPath = join(fixtureDir, 'test.csv');
      const csvContent = `source,destination
/path1,/dest1`;
      writeFileSync(csvPath, csvContent);

      client.setArgv('redirects', 'upload', csvPath);
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Import CSV file "test.csv"?');
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Import cancelled');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should handle --overwrite flag', async () => {
      const csvPath = join(fixtureDir, 'test.csv');
      const csvContent = `source,destination
/path1,/dest1`;
      writeFileSync(csvPath, csvContent);

      mockPutRedirects({ redirectCount: 1 });

      client.setArgv('redirects', 'upload', csvPath, '--overwrite', '--yes');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Importing redirects');
      await expect(client.stderr).toOutput('Imported 1 redirect');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should prompt to promote if no existing staging version', async () => {
      const csvPath = join(fixtureDir, 'test.csv');
      const csvContent = `source,destination
/path1,/dest1`;
      writeFileSync(csvPath, csvContent);

      mockPutRedirects({ redirectCount: 1 });

      client.scenario.post('/v1/bulk-redirects/versions', (_req, res) => {
        res.json({
          version: {
            id: 'version-1',
            name: 'Upload Version',
            isLive: true,
          },
        });
      });

      client.setArgv('redirects', 'upload', csvPath);
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Import CSV file "test.csv"?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Do you want to provide a name for this version?'
      );
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('This is the only staged change');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Version promoted to production');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should warn about existing staging changes', async () => {
      const csvPath = join(fixtureDir, 'test.csv');
      const csvContent = `source,destination
/path1,/dest1`;
      writeFileSync(csvPath, csvContent);

      client.scenario.get('/v1/bulk-redirects/versions', (_req, res) => {
        res.json({
          versions: [
            {
              id: 'existing-staging',
              name: 'Existing Staging',
              isStaging: true,
              isLive: false,
            },
          ],
        });
      });

      client.scenario.put('/v1/bulk-redirects', (_req, res) => {
        res.json({
          alias: 'test-alias.vercel.app',
          version: {
            id: 'version-2',
            name: 'Upload Version',
          },
          redirectsCount: 1,
          count: 1,
        });
      });

      client.scenario.get('/v1/bulk-redirects', (req, res) => {
        const versionId = req.query.versionId;
        const diff = req.query.diff;
        if (versionId === 'version-2' && diff === 'only') {
          res.json({
            redirects: [
              {
                source: '/path1',
                destination: '/dest1',
                statusCode: 301,
                action: '+',
              },
            ],
          });
        } else {
          res.json({ redirects: [] });
        }
      });

      client.setArgv('redirects', 'upload', csvPath, '--yes');
      const exitCodePromise = redirects(client);

      await expect(exitCodePromise).resolves.toEqual(0);
    });
  });

  describe('JSON upload', () => {
    it('should upload redirects from JSON file', async () => {
      const jsonPath = join(fixtureDir, 'test.json');
      const jsonContent = JSON.stringify([
        { source: '/old', destination: '/new', statusCode: 301 },
        { source: '/path', destination: '/dest', statusCode: 302 },
      ]);
      writeFileSync(jsonPath, jsonContent);

      mockPutRedirects({ redirectCount: 2 });

      client.setArgv('redirects', 'upload', jsonPath, '--yes');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Importing redirects');
      await expect(client.stderr).toOutput('Imported 2 redirects');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should upload redirects with full-domain source URLs', async () => {
      const jsonPath = join(fixtureDir, 'domain-source.json');
      const jsonContent = JSON.stringify([
        {
          source: 'https://old.example.com/path',
          destination: '/new-path',
          statusCode: 301,
        },
        { source: '/relative', destination: '/dest', statusCode: 302 },
      ]);
      writeFileSync(jsonPath, jsonContent);

      mockPutRedirects({ redirectCount: 2 });

      client.setArgv('redirects', 'upload', jsonPath, '--yes');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Importing redirects');
      await expect(client.stderr).toOutput('Imported 2 redirects');

      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should error on invalid JSON format', async () => {
      const jsonPath = join(fixtureDir, 'invalid.json');
      const jsonContent = `{ invalid json }`;
      writeFileSync(jsonPath, jsonContent);

      client.setArgv('redirects', 'upload', jsonPath, '--yes');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Invalid JSON file format');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error if JSON is not an array', async () => {
      const jsonPath = join(fixtureDir, 'object.json');
      const jsonContent = JSON.stringify({
        redirect: { source: '/old', destination: '/new' },
      });
      writeFileSync(jsonPath, jsonContent);

      client.setArgv('redirects', 'upload', jsonPath, '--yes');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput(
        'JSON file must contain an array of redirects'
      );

      await expect(exitCodePromise).resolves.toEqual(1);
    });
  });

  describe('file validation', () => {
    it('should error if file does not exist', async () => {
      client.setArgv('redirects', 'upload', '/nonexistent.csv', '--yes');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('File "/nonexistent.csv" not found');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error if path is not a file', async () => {
      client.setArgv('redirects', 'upload', fixtureDir, '--yes');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput(
        `Path "${fixtureDir}" is not a file`
      );

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error on unsupported file extension', async () => {
      const txtPath = join(fixtureDir, 'test.txt');
      writeFileSync(txtPath, 'some content');

      client.setArgv('redirects', 'upload', txtPath, '--yes');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('File must be a .csv or .json file');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error if file exceeds size limit', async () => {
      const largePath = join(fixtureDir, 'large.csv');
      const largeContent = 'a'.repeat(51 * 1024 * 1024);
      writeFileSync(largePath, largeContent);

      client.setArgv('redirects', 'upload', largePath, '--yes');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('File must be below 50MB');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should error if no file path provided', async () => {
      client.setArgv('redirects', 'upload');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('File path is required');

      await expect(exitCodePromise).resolves.toEqual(2);
    });

    it('should output action_required with <file> placeholder when no file in non-interactive mode', async () => {
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv(
        'redirects',
        'upload',
        '--cwd=/tmp/project',
        '--non-interactive'
      );
      await expect(redirects(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('missing_arguments');
      expect(payload.message).toContain('File path is required');
      expect(payload.next[0].command).toContain('redirects import <file>');
      expect(payload.next[0].command).toContain('--cwd=/tmp/project');
      expect(payload.next[0].command).toContain('--yes');

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });
  });

  describe('API error handling', () => {
    it('should handle API error response', async () => {
      const csvPath = join(fixtureDir, 'test.csv');
      const csvContent = `source,destination
/path1,/dest1`;
      writeFileSync(csvPath, csvContent);

      client.scenario.put('/v1/bulk-redirects', (_req, res) => {
        res.status(400).json({
          error: {
            message: 'Invalid redirect configuration',
          },
        });
      });

      client.setArgv('redirects', 'upload', csvPath, '--yes');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput('Invalid redirect configuration');

      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should handle non-JSON error response', async () => {
      const csvPath = join(fixtureDir, 'test.csv');
      const csvContent = `source,destination
/path1,/dest1`;
      writeFileSync(csvPath, csvContent);

      client.scenario.put('/v1/bulk-redirects', (_req, res) => {
        res.status(500).end('Internal Server Error');
      });

      client.setArgv('redirects', 'upload', csvPath, '--yes');
      const exitCodePromise = redirects(client);

      await expect(client.stderr).toOutput(
        'Failed to import redirects: Response Error (500)'
      );

      await expect(exitCodePromise).resolves.toEqual(1);
    });
  });

  describe('client.nonInteractive', () => {
    it('should output action_required JSON with next command when --yes not provided in non-interactive mode', async () => {
      const csvPath = join(fixtureDir, 'test.csv');
      const csvContent = `source,destination
/old,/new`;
      writeFileSync(csvPath, csvContent);

      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('redirects', 'upload', csvPath);
      await expect(redirects(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('confirmation_required');
      expect(payload.message).toContain('--yes to confirm import');
      expect(Array.isArray(payload.next)).toBe(true);
      expect(payload.next[0].command).toContain('redirects upload');
      expect(payload.next[0].command).toContain('--yes');
      expect(payload.next[0].when).toBe('to confirm import');

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });

    it('should output JSON only on success when non-interactive with --yes', async () => {
      const csvPath = join(fixtureDir, 'test.csv');
      const csvContent = `source,destination
/old,/new`;
      writeFileSync(csvPath, csvContent);

      mockPutRedirects({ redirectCount: 1 });

      client.nonInteractive = true;
      client.setArgv('redirects', 'upload', csvPath, '--yes');
      const exitCode = await redirects(client);

      expect(exitCode).toEqual(0);
      const out = client.stdout.getFullOutput();
      const json = JSON.parse(out);
      expect(json.status).toEqual('ok');
      expect(json.version).toBeDefined();
      expect(json.next).toBeDefined();
      expect(json.next[0].command).toContain('redirects promote');
      expect(json.next[0].command).toContain('version-1');

      client.nonInteractive = false;
    });
  });

  describe('subcommand name', () => {
    function writeCsv() {
      const csvPath = join(fixtureDir, 'test.csv');
      writeFileSync(csvPath, `source,destination\n/old,/new`);
      return csvPath;
    }

    it('warns when invoked as the deprecated upload name', async () => {
      mockPutRedirects({ redirectCount: 1 });
      client.setArgv('redirects', 'upload', writeCsv(), '--yes');

      expect(await redirects(client)).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        '`vercel redirects upload` is deprecated. Use `vercel redirects import`.'
      );
    });

    it('does not warn when invoked as import', async () => {
      mockPutRedirects({ redirectCount: 1 });
      client.setArgv('redirects', 'import', writeCsv(), '--yes');

      expect(await redirects(client)).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:import', value: 'import' },
      ]);
    });

    it.each([
      'import',
      'upload',
    ])('keeps the options typed after %s in suggestions', async name => {
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv(
        'redirects',
        name,
        '--cwd=/tmp/project',
        '--non-interactive'
      );
      await expect(redirects(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.next[0].command).toContain(
        'redirects import <file> --cwd=/tmp/project'
      );

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });

    it('shows only import in help', () => {
      const groupHelp = help(redirectsCommand, {
        stream: { isTTY: false },
        columns: 120,
      });
      expect(groupHelp).toMatch(/^ {2}import\s/m);
      expect(groupHelp).not.toContain('upload');

      const importHelp = help(uploadSubcommand, {
        stream: { isTTY: false },
        parent: redirectsCommand,
        columns: 120,
      });
      expect(importHelp).toContain('redirects import redirects.csv');
      expect(importHelp).not.toContain('upload');
    });
  });

  it('tracks subcommand invocation', async () => {
    const csvPath = join(fixtureDir, 'test.csv');
    const csvContent = `source,destination
/old,/new`;
    writeFileSync(csvPath, csvContent);

    mockPutRedirects({ redirectCount: 1 });

    client.setArgv('redirects', 'upload', csvPath, '--yes');
    const exitCodePromise = redirects(client);

    await expect(exitCodePromise).resolves.toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:import',
        value: 'upload',
      },
    ]);
  });
});

function mockPutRedirects(options?: { redirectCount?: number }): void {
  const count = options?.redirectCount ?? 1;
  client.scenario.put('/v1/bulk-redirects', (_req, res) => {
    res.json({
      alias: 'test-alias.vercel.app',
      version: {
        id: 'version-1',
        name: 'Upload Version',
      },
      redirectsCount: count,
      count: count,
    });
  });

  client.scenario.get('/v1/bulk-redirects', (req, res) => {
    const versionId = req.query.versionId;
    const diff = req.query.diff;
    if (versionId === 'version-1' && diff === 'only') {
      const redirects = [];
      for (let i = 0; i < count; i++) {
        redirects.push({
          source: `/path${i}`,
          destination: `/dest${i}`,
          statusCode: 301,
          action: '+',
        });
      }
      res.json({ redirects });
    } else {
      res.json({ redirects: [] });
    }
  });
}

describe('redirects import --force', () => {
  // Runs `redirects import` with a fresh client, recording the upload body.
  async function run(...args: string[]) {
    return runWith({}, ...args);
  }

  async function runWith(
    { nonInteractive = false }: { nonInteractive?: boolean },
    ...args: string[]
  ) {
    client.reset();
    client.nonInteractive = nonInteractive;
    useUser();
    useTeams('team_dummy');
    const { project } = useProject({
      ...defaultProject,
      id: 'redirects-test',
      name: 'redirects-test',
    });
    client.scenario.get('/v9/projects/:projectNameOrId', (_req, res) => {
      res.json(project);
    });
    const cwd = setupUnitFixture('commands/redirects');
    client.cwd = cwd;
    const dir = join(cwd, 'fixtures');
    mkdirSync(dir, { recursive: true });
    const jsonPath = join(dir, 'force.json');
    writeFileSync(
      jsonPath,
      JSON.stringify([{ source: '/a', destination: '/b' }])
    );
    client.scenario.get('/v1/bulk-redirects/versions', (_req, res) => {
      res.json({ versions: [] });
    });
    let body: Record<string, unknown> | undefined;
    client.scenario.put('/v1/bulk-redirects', (req, res) => {
      body = req.body;
      res.json({ version: { id: 'version-1' }, count: 1 });
    });
    client.scenario.get('/v1/bulk-redirects', (_req, res) => {
      res.json({ redirects: [] });
    });
    client.setArgv('redirects', 'import', jsonPath, ...args);
    // A JSON action-required payload exits the process.
    const exit = vi.spyOn(process, 'exit').mockImplementation(code => {
      throw Object.assign(new Error('exit'), { code });
    });
    let exitCode: number;
    try {
      exitCode = await redirects(client);
    } catch (err) {
      exitCode = (err as { code: number }).code;
    } finally {
      exit.mockRestore();
    }
    return {
      exitCode,
      body,
      // Each run uploads from its own temporary directory. JSON output
      // escapes the path, which doubles Windows backslashes.
      stdout: client.stdout
        .getFullOutput()
        .split(JSON.stringify(jsonPath).slice(1, -1))
        .join('<file>')
        .split(jsonPath)
        .join('<file>'),
      stderr: client.stderr.getFullOutput(),
    };
  }

  it('replaces all redirects with --force', async () => {
    const result = await run('--force', '--yes');

    expect(result.exitCode).toBe(0);
    expect(result.body).toMatchObject({ overwrite: true });
    expect(result.stderr).not.toContain('deprecated');
  });

  it('still accepts --overwrite, with one warning that names --force', async () => {
    const now = await run('--force', '--yes');
    const before = await run('--overwrite', '--yes');

    expect(before.exitCode).toBe(now.exitCode);
    expect(before.body).toEqual(now.body);
    expect(before.stdout).toBe(now.stdout);
    expect(before.stderr.match(/deprecated/g)).toHaveLength(1);
    expect(before.stderr).toContain(
      '! --overwrite is deprecated. Use --force.\n'
    );
  });

  it('still needs --yes without a terminal, and suggests --force', async () => {
    const now = await runWith({ nonInteractive: true }, '--force');
    const before = await runWith({ nonInteractive: true }, '--overwrite');

    expect(now.exitCode).toBe(1);
    expect(now.body).toBeUndefined();
    expect(before.exitCode).toBe(now.exitCode);
    expect(before.body).toBeUndefined();
    expect(before.stdout).toBe(now.stdout);
    const { next } = JSON.parse(before.stdout);
    expect(next[0].command).toContain('--force --yes');
    expect(next[0].command).not.toContain('--overwrite');
  });

  it('rejects --force with --overwrite before any request', async () => {
    const result = await run('--force', '--overwrite', '--yes');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Can't use --force with --overwrite.");
    expect(result.body).toBeUndefined();
  });
});
