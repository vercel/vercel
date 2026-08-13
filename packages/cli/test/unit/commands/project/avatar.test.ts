import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, afterEach } from 'vitest';
import projects from '../../../../src/commands/project';
import { useUser } from '../../../mocks/user';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../../mocks/project';
import { client } from '../../../mocks/client';

// First 8 bytes are the PNG signature; the rest is filler.
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const PNG_BASE64 = Buffer.from(PNG_BYTES).toString('base64');

// First 3 bytes are the JPEG signature; the rest is filler.
const JPEG_BYTES = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
]);

// UTF-8 BOM plus leading whitespace before `<svg` exercises the sniffing
// branch that trims the decoded head before matching.
const SVG_WITH_BOM =
  '\uFEFF\n  <svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';

let tmpDir: string | undefined;

function writeFixture(name: string, contents: string | Uint8Array): string {
  if (!tmpDir) {
    tmpDir = mkdtempSync(join(tmpdir(), 'vc-cli-avatar-'));
  }
  const filePath = join(tmpDir, name);
  writeFileSync(filePath, contents);
  return filePath;
}

/**
 * Register the avatar upload endpoint and capture the raw request so tests can
 * assert the transport encoding (raw bytes + Content-Type, not base64/JSON).
 * The body is captured as base64 to compare bytes without Buffer typing noise.
 */
function captureAvatarUpload(projectId: string) {
  const captured: { contentType?: string; bodyBase64?: string } = {};
  client.scenario.post(
    `/v1/projects/${projectId}/avatar`,
    (req: any, res: any) => {
      captured.contentType = req.headers['content-type'];
      const chunks: Uint8Array[] = [];
      req.on('data', (chunk: Uint8Array) => chunks.push(chunk));
      req.on('end', () => {
        captured.bodyBase64 = Buffer.concat(chunks).toString('base64');
        res.json({ ...defaultProject, id: projectId, name: projectId });
      });
    }
  );
  return captured;
}

describe('project avatar', () => {
  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('project', 'avatar', '--help');
      const exitCodePromise = projects(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'project:avatar',
        },
      ]);
    });
  });

  describe('set <project> <file>', () => {
    it('uploads the raw image bytes with the sniffed content type', async () => {
      useUser();
      useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });
      const captured = captureAvatarUpload('test-project');

      const filePath = writeFixture('avatar.png', PNG_BYTES);

      client.setArgv('project', 'avatar', 'set', 'test-project', filePath);
      const exitCode = await projects(client);

      expect(exitCode).toEqual(0);
      // Verify encoding: raw bytes over the wire, declared as image/png.
      expect(captured.contentType).toEqual('image/png');
      expect(captured.bodyBase64).toEqual(PNG_BASE64);
      await expect(client.stderr).toOutput(
        'Success! Avatar set for project test-project'
      );
    });

    it('uploads a JPEG with content type image/jpeg', async () => {
      useUser();
      useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });
      const captured = captureAvatarUpload('test-project');

      const filePath = writeFixture('avatar.jpg', JPEG_BYTES);

      client.setArgv('project', 'avatar', 'set', 'test-project', filePath);
      const exitCode = await projects(client);

      expect(exitCode).toEqual(0);
      expect(captured.contentType).toEqual('image/jpeg');
      expect(captured.bodyBase64).toEqual(
        Buffer.from(JPEG_BYTES).toString('base64')
      );
      await expect(client.stderr).toOutput(
        'Success! Avatar set for project test-project'
      );
    });

    it('uploads an SVG with a BOM and leading whitespace as image/svg+xml', async () => {
      useUser();
      useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });
      const captured = captureAvatarUpload('test-project');

      const filePath = writeFixture('avatar.svg', SVG_WITH_BOM);

      client.setArgv('project', 'avatar', 'set', 'test-project', filePath);
      const exitCode = await projects(client);

      expect(exitCode).toEqual(0);
      expect(captured.contentType).toEqual('image/svg+xml');
      expect(captured.bodyBase64).toEqual(
        Buffer.from(SVG_WITH_BOM).toString('base64')
      );
      await expect(client.stderr).toOutput(
        'Success! Avatar set for project test-project'
      );
    });

    it('errors when the path is a directory and makes no remote call', async () => {
      useUser();
      useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });
      const captured = captureAvatarUpload('test-project');

      // Materialize the fixture dir, then point the command at a directory.
      writeFixture('placeholder.png', PNG_BYTES);
      const dirPath = join(tmpDir!, 'a-directory');
      mkdirSync(dirPath);

      client.setArgv('project', 'avatar', 'set', 'test-project', dirPath);
      const exitCode = await projects(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Not a file');
      // Local validation failed, so the upload endpoint was never hit.
      expect(captured.contentType).toBeUndefined();
    });

    it('tracks telemetry with redacted project and file', async () => {
      useUser();
      useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });
      captureAvatarUpload('test-project');

      const filePath = writeFixture('avatar.png', PNG_BYTES);

      client.setArgv('project', 'avatar', 'set', 'test-project', filePath);
      await projects(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:avatar',
          value: 'avatar set',
        },
        {
          key: 'argument:action',
          value: 'set',
        },
        {
          key: 'argument:project',
          value: '[REDACTED]',
        },
        {
          key: 'argument:file',
          value: '[REDACTED]',
        },
      ]);
    });

    it('errors when the file does not exist', async () => {
      useUser();
      useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });

      const missing = join(tmpdir(), `vc-cli-avatar-missing-${Date.now()}.png`);
      client.setArgv('project', 'avatar', 'set', 'test-project', missing);
      const exitCode = await projects(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('File not found');
    });

    it('errors when the file is not a supported image type', async () => {
      useUser();
      useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });

      const filePath = writeFixture('not-an-image.txt', 'hello world');
      client.setArgv('project', 'avatar', 'set', 'test-project', filePath);
      const exitCode = await projects(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Unsupported image type');
    });

    it('errors when the file exceeds the size limit', async () => {
      useUser();
      useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });

      const oversized = new Uint8Array(1024 * 1024 + 1 + PNG_BYTES.length);
      oversized.set(PNG_BYTES, 0);
      const filePath = writeFixture('big.png', oversized);
      client.setArgv('project', 'avatar', 'set', 'test-project', filePath);
      const exitCode = await projects(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('bytes or fewer');
    });

    it('errors when the project does not exist', async () => {
      useUser();
      useUnknownProject();

      const filePath = writeFixture('avatar.png', PNG_BYTES);
      client.setArgv('project', 'avatar', 'set', 'does-not-exist', filePath);
      const exitCode = await projects(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('No such project exists');
    });

    it('errors on an unknown action', async () => {
      useUser();

      client.setArgv('project', 'avatar', 'bogus', 'x', 'y');
      const exitCode = await projects(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Unknown action');
    });
  });
});
