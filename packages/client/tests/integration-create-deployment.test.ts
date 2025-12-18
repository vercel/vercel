import { it, expect, describe, beforeEach, vi } from 'vitest';
import path from 'path';
import fetch_ from 'node-fetch';
import { generateNewToken } from './common';
import { Deployment } from './types';
import { createDeployment } from '../src/index';
import { isObject } from '@vercel/error-utils';
import { generateFakeFiles, setupTmpDir } from './util/generate-fake-files';
import tar from 'tar-fs';
import { createGunzip } from 'zlib';
import { once, Readable } from 'stream';
import fs from 'fs';

describe('create v2 deployment', () => {
  let deployment: Deployment;
  let token = '';

  beforeEach(async () => {
    token = await generateNewToken();
  });

  it('will display an empty deployment warning', async () => {
    for await (const event of createDeployment(
      {
        token,
        teamId: process.env.VERCEL_TEAM_ID,
        path: path.resolve(__dirname, 'fixtures', 'v2'),
      },
      {
        name: 'now-clien-tests-v2',
      }
    )) {
      if (event.type === 'warning') {
        expect(event.payload).toEqual('READY');
      }

      if (event.type === 'ready') {
        deployment = event.payload;
        break;
      }
    }
  });

  it('will report correct file count event', async () => {
    for await (const event of createDeployment(
      {
        token,
        teamId: process.env.VERCEL_TEAM_ID,
        path: path.resolve(__dirname, 'fixtures', 'v2'),
      },
      {
        name: 'now-client-tests-v2',
      }
    )) {
      if (event.type === 'file-count') {
        expect(event.payload.total).toEqual(0);
      }

      if (event.type === 'ready') {
        deployment = event.payload;
        break;
      }
    }
  });

  it('will create a v2 deployment', async () => {
    for await (const event of createDeployment(
      {
        token,
        teamId: process.env.VERCEL_TEAM_ID,
        path: path.resolve(__dirname, 'fixtures', 'v2'),
      },
      {
        name: 'now-client-tests-v2',
      }
    )) {
      if (event.type === 'ready') {
        deployment = event.payload;
        expect(deployment.readyState).toEqual('READY');
        break;
      }
    }
  });

  it('will create a v2 deployment with correct file permissions', async () => {
    let error = null;
    for await (const event of createDeployment(
      {
        token,
        teamId: process.env.VERCEL_TEAM_ID,
        path: path.resolve(__dirname, 'fixtures', 'v2-file-permissions'),
        skipAutoDetectionConfirmation: true,
      },
      {
        name: 'now-client-tests-v2',
        projectSettings: {
          buildCommand: null,
          devCommand: null,
          outputDirectory: null,
        },
      }
    )) {
      if (event.type === 'ready') {
        deployment = event.payload;
        break;
      } else if (event.type === 'error') {
        error = event.payload;
        console.error(error.message);
        break;
      }
    }

    expect(error).toBe(null);
    expect(deployment.readyState).toEqual('READY');

    const url = `https://${deployment.url}/api/index.js`;
    console.log('testing url ' + url);
    const response = await fetch_(url);
    const text = await response.text();
    expect(deployment.readyState).toEqual('READY');
    expect(text).toContain('executed bash script');
  });

  it('will create a v2 deployment and ignore files specified in .nowignore', async () => {
    let error = null;
    for await (const event of createDeployment(
      {
        token,
        teamId: process.env.VERCEL_TEAM_ID,
        path: path.resolve(__dirname, 'fixtures', 'nowignore'),
        skipAutoDetectionConfirmation: true,
      },
      {
        name: 'now-client-tests-v2',
        projectSettings: {
          buildCommand: null,
          devCommand: null,
          outputDirectory: null,
        },
      }
    )) {
      if (event.type === 'ready') {
        deployment = event.payload;
        break;
      } else if (event.type === 'error') {
        error = event.payload;
        console.error(error.message);
        break;
      }
    }

    expect(error).toBe(null);
    expect(deployment.readyState).toEqual('READY');

    const index = await fetch_(`https://${deployment.url}`);
    expect(index.status).toBe(200);
    expect(await index.text()).toBe('Hello World!');

    const ignore1 = await fetch_(`https://${deployment.url}/ignore.txt`);
    expect(ignore1.status).toBe(404);

    const ignore2 = await fetch_(`https://${deployment.url}/folder/ignore.txt`);
    expect(ignore2.status).toBe(404);

    const ignore3 = await fetch_(
      `https://${deployment.url}/node_modules/ignore.txt`
    );
    expect(ignore3.status).toBe(404);
  });

  describe('using --archive=tgz', () => {
    // mocking function to chunk every 10kb instead of 100mb
    // to save time and memory in the test
    vi.mock('@vercel/build-utils', async importActual => {
      const actual: typeof import('@vercel/build-utils') = await importActual();
      return {
        ...actual,
        streamToBufferChunks: (stream: NodeJS.ReadableStream) => {
          return actual.streamToBufferChunks(stream, 10 * 1024);
        },
      };
    });

    it('single file deployments untar to original project', async () => {
      const uploadFolder = await generateFakeFiles(50, 100);
      const args: Parameters<typeof createDeployment> = [
        {
          token,
          teamId: process.env.VERCEL_TEAM_ID,
          path: uploadFolder,
          archive: 'tgz',
        },
        { name: 'archive-project' },
      ];

      const buffersFromChunkArchiving = new Map<string, Buffer>();
      for await (const event of createDeployment(...args)) {
        if (event.type === 'hashes-calculated') {
          Object.values(event.payload).forEach(item => {
            if (
              isObject(item) &&
              'data' in item &&
              Buffer.isBuffer(item.data) &&
              Array.isArray(item.names)
            ) {
              const fileName = path.basename(item.names[0]);
              buffersFromChunkArchiving.set(fileName, item.data);
            }
          });
        }
      }

      expect(buffersFromChunkArchiving.size).toEqual(1);
      const concatenatedBufferFromChunkArchiving = Buffer.concat([
        buffersFromChunkArchiving.get('source.tgz.part1')!,
      ]);

      {
        const tmpDir = setupTmpDir();
        const extractStream = Readable.from(
          concatenatedBufferFromChunkArchiving
        )
          .pipe(createGunzip())
          .pipe(tar.extract(tmpDir));
        await once(extractStream, 'finish');
        assertDirectoriesAreEqual(tmpDir, uploadFolder);
      }
    });

    it('multipart archive deployments untar to original project', async () => {
      const uploadFolder = await generateFakeFiles(300, 100);
      const args: Parameters<typeof createDeployment> = [
        {
          token,
          teamId: process.env.VERCEL_TEAM_ID,
          path: uploadFolder,
          archive: 'tgz',
        },
        { name: 'archive-project' },
      ];

      const buffersFromChunkArchiving = new Map<string, Buffer>();
      for await (const event of createDeployment(...args)) {
        if (event.type === 'hashes-calculated') {
          Object.values(event.payload).forEach(item => {
            if (
              isObject(item) &&
              'data' in item &&
              Buffer.isBuffer(item.data) &&
              Array.isArray(item.names)
            ) {
              const fileName = path.basename(item.names[0]);
              buffersFromChunkArchiving.set(fileName, item.data);
            }
          });
        }
      }

      expect(buffersFromChunkArchiving.size).toEqual(4);
      const concatenatedBufferFromChunkArchiving = Buffer.concat([
        buffersFromChunkArchiving.get('source.tgz.part1')!,
        buffersFromChunkArchiving.get('source.tgz.part2')!,
        buffersFromChunkArchiving.get('source.tgz.part3')!,
        buffersFromChunkArchiving.get('source.tgz.part4')!,
      ]);

      {
        const tmpDir = setupTmpDir();
        const extractStream = Readable.from(
          concatenatedBufferFromChunkArchiving
        )
          .pipe(createGunzip())
          .pipe(tar.extract(tmpDir));
        await once(extractStream, 'finish');
        assertDirectoriesAreEqual(tmpDir, uploadFolder);
      }
    });
  });
});

function assertDirectoriesAreEqual(dir1: string, dir2: string) {
  const dir1Files = fs.readdirSync(dir1).sort();
  const dir2Files = fs.readdirSync(dir2).sort();
  expect(dir1Files).toEqual(dir2Files);

  for (const file of dir1Files) {
    const filePath1 = path.join(dir1, file);
    const filePath2 = path.join(dir2, file);
    const stat1 = fs.statSync(filePath1);
    const stat2 = fs.statSync(filePath2);
    expect(stat1.isDirectory()).toBe(stat2.isDirectory());

    if (stat1.isDirectory()) {
      assertDirectoriesAreEqual(filePath1, filePath2);
    } else {
      const content1 = fs.readFileSync(filePath1, 'utf-8');
      const content2 = fs.readFileSync(filePath2, 'utf-8');
      expect(content1).toBe(content2);
    }
  }
}

describe('inline upload strategies', () => {
  let token = '';

  beforeEach(async () => {
    token = await generateNewToken();
  });

  describe('strategy 1: all files inline upload (< 250KB)', () => {
    it('should upload small files inline during deployment creation', async () => {
      const tmpDir = setupTmpDir();

      // Create small files that total less than 250KB
      fs.writeFileSync(
        path.join(tmpDir, 'index.html'),
        '<html><body>Hello World!</body></html>'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'style.css'),
        'body { margin: 0; padding: 20px; }'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'script.js'),
        'console.log("Hello from inline upload!");'
      );

      let deployment: Deployment;
      let hashedCalculatedEventReceived = false;
      let fileUploadEventsReceived = false;

      for await (const event of createDeployment(
        {
          token,
          teamId: process.env.VERCEL_TEAM_ID,
          path: tmpDir,
        },
        {
          name: 'inline-upload-small-test',
        }
      )) {
        if (event.type === 'hashes-calculated') {
          hashedCalculatedEventReceived = true;
          // Verify we have the expected number of files
          expect(Object.keys(event.payload).length).toBeGreaterThan(0);
        }

        // Strategy 1 should NOT emit any file upload events
        if (
          event.type === 'file-uploaded' ||
          event.type === 'all-files-uploaded'
        ) {
          fileUploadEventsReceived = true;
        }

        if (event.type === 'ready') {
          deployment = event.payload;
          expect(deployment.readyState).toEqual('READY');
          break;
        }
      }

      expect(hashedCalculatedEventReceived).toBe(true);
      expect(fileUploadEventsReceived).toBe(false);
      expect(deployment!.readyState).toEqual('READY');

      // Verify deployment works
      const response = await fetch_(`https://${deployment!.url}`);
      expect(response.status).toBe(200);
      const content = await response.text();
      expect(content).toContain('Hello World!');
    });

    it('should handle binary files in inline upload', async () => {
      const tmpDir = setupTmpDir();

      // Create a small binary file and text file
      fs.writeFileSync(
        path.join(tmpDir, 'index.html'),
        '<html>Binary Test</html>'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'favicon.ico'),
        Buffer.from([
          0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x28, 0x01,
        ])
      );

      let deployment: Deployment;
      let fileUploadEventsReceived = false;

      for await (const event of createDeployment(
        {
          token,
          teamId: process.env.VERCEL_TEAM_ID,
          path: tmpDir,
        },
        {
          name: 'inline-upload-binary-test',
        }
      )) {
        // Strategy 1 should NOT emit any file upload events
        if (
          event.type === 'file-uploaded' ||
          event.type === 'all-files-uploaded'
        ) {
          fileUploadEventsReceived = true;
        }

        if (event.type === 'ready') {
          deployment = event.payload;
          break;
        }
      }

      expect(fileUploadEventsReceived).toBe(false);
      expect(deployment!.readyState).toEqual('READY');

      // Verify both text and binary files are accessible
      const htmlResponse = await fetch_(`https://${deployment!.url}`);
      expect(htmlResponse.status).toBe(200);
      const icoResponse = await fetch_(
        `https://${deployment!.url}/favicon.ico`
      );
      expect(icoResponse.status).toBe(200);
    });
  });

  describe('strategy 2: hybrid upload (mixed pre-uploaded + inline)', () => {
    it('should use hybrid approach when appropriate', async () => {
      const tmpDir = setupTmpDir();

      // Create some small files for inline upload
      fs.writeFileSync(
        path.join(tmpDir, 'index.html'),
        '<html><body>Hybrid test</body></html>'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'small.txt'),
        'This is a small file for inline upload'
      );

      // Create a larger file that might be pre-uploaded (but still under 250KB total)
      const largeContent = 'A'.repeat(50 * 1024); // 50KB individual file (total stays under 250KB)
      fs.writeFileSync(path.join(tmpDir, 'large.txt'), largeContent);

      let deployment: Deployment;
      let fileCountEventReceived = false;
      let fileUploadEventsReceived = false;

      for await (const event of createDeployment(
        {
          token,
          teamId: process.env.VERCEL_TEAM_ID,
          path: tmpDir,
        },
        {
          name: 'hybrid-upload-test',
        }
      )) {
        if (event.type === 'file-count') {
          fileCountEventReceived = true;
          expect(event.payload.total).toBeGreaterThan(0);
        }

        // Strategy 2 should also NOT emit file upload events (uses inline for missing files)
        if (
          event.type === 'file-uploaded' ||
          event.type === 'all-files-uploaded'
        ) {
          fileUploadEventsReceived = true;
        }

        if (event.type === 'ready') {
          deployment = event.payload;
          break;
        }
      }

      expect(fileCountEventReceived).toBe(true);
      expect(fileUploadEventsReceived).toBe(false);
      expect(deployment!.readyState).toEqual('READY');

      // Verify all files are accessible
      const htmlResponse = await fetch_(`https://${deployment!.url}`);
      expect(htmlResponse.status).toBe(200);
      const largeResponse = await fetch_(
        `https://${deployment!.url}/large.txt`
      );
      expect(largeResponse.status).toBe(200);
      const largeText = await largeResponse.text();
      expect(largeText).toBe(largeContent);
    });
  });

  describe('strategy 3: fallback to traditional upload (> 250KB)', () => {
    it('should fallback to traditional upload for large files', async () => {
      const tmpDir = setupTmpDir();

      // Create files that exceed the 250KB threshold
      fs.writeFileSync(
        path.join(tmpDir, 'index.html'),
        '<html><body>Large upload test</body></html>'
      );
      const largeContent = 'B'.repeat(300 * 1024); // 300KB file, exceeds threshold
      fs.writeFileSync(path.join(tmpDir, 'large.js'), largeContent);

      let deployment: Deployment;
      let uploadEventReceived = false;

      for await (const event of createDeployment(
        {
          token,
          teamId: process.env.VERCEL_TEAM_ID,
          path: tmpDir,
        },
        {
          name: 'traditional-upload-test',
        }
      )) {
        if (
          event.type === 'file-uploaded' ||
          event.type === 'all-files-uploaded'
        ) {
          uploadEventReceived = true;
        }

        if (event.type === 'ready') {
          deployment = event.payload;
          break;
        }
      }

      // For large files, we should see upload events (traditional flow)
      expect(uploadEventReceived).toBe(true);
      expect(deployment!.readyState).toEqual('READY');

      // Verify the large file is accessible
      const response = await fetch_(`https://${deployment!.url}/large.js`);
      expect(response.status).toBe(200);
      const content = await response.text();
      expect(content.length).toBe(300 * 1024);
    });
  });
});
