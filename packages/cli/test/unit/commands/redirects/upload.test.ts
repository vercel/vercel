import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import redirects from '../../../../src/commands/redirects';
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
      await expect(exitCodePromise).resolves.toEqual(2);

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

      await expect(client.stderr).toOutput('Uploading redirects');
      await expect(client.stderr).toOutput('Redirects uploaded');
      await expect(client.stderr).toOutput('Uploaded 2 redirects');

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

      await expect(client.stderr).toOutput('Upload CSV file "test.csv"?');
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

      await expect(client.stderr).toOutput('Upload CSV file "test.csv"?');
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput('Upload cancelled');

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

      await expect(client.stderr).toOutput('Uploading redirects');
      await expect(client.stderr).toOutput('Uploaded 1 redirect');

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

      await expect(client.stderr).toOutput('Upload CSV file "test.csv"?');
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

      await expect(client.stderr).toOutput('Uploading redirects');
      await expect(client.stderr).toOutput('Uploaded 2 redirects');

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

      await expect(exitCodePromise).resolves.toEqual(1);
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
        'Failed to upload redirects: Response Error (500)'
      );

      await expect(exitCodePromise).resolves.toEqual(1);
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
        key: 'subcommand:upload',
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
