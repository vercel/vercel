import { chmodSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildWithLifecycle } from '../src/buildpacks/lifecycle';
import { BUILDPACKS } from '../src/buildpacks/registry';
import { delay, run } from '../src/util';

const runIntegration = process.env.RUN_BUILDPACK_INTEGRATION === '1';

describe.skipIf(!runIntegration)('Ruby buildpack integration', () => {
  it(
    'builds and serves a Rack application through Docker',
    async () => {
      const tag = `vercel-ruby-buildpack-integration:${process.pid}`;
      const containerName = `vercel-ruby-buildpack-integration-${process.pid}`;
      const workPath = mkdtempSync(
        join(tmpdir(), 'vercel-ruby-buildpack-integration-')
      );
      cpSync(join(__dirname, 'fixtures', 'ruby-rack'), workPath, {
        recursive: true,
      });
      // Exercise staging when the root is traversable but a nested app file
      // is not readable by the final image's unprivileged user.
      chmodSync(workPath, 0o755);
      chmodSync(join(workPath, 'config.ru'), 0o600);
      chmodSync(join(workPath, 'bin', 'server'), 0o700);

      try {
        const ruby = BUILDPACKS.find(bp => bp.runtime === 'ruby')!;
        await buildWithLifecycle(ruby, { workPath, tag }, {});
        await run('docker', [
          'run',
          '--detach',
          '--name',
          containerName,
          '--publish',
          '127.0.0.1::8080',
          '--env',
          'PORT=8080',
          '--entrypoint',
          'launcher',
          tag,
          '--',
          './bin/server',
        ]);
        const { stdout } = await run(
          'docker',
          ['port', containerName, '8080/tcp'],
          { quiet: true }
        );
        const port = Number(stdout.match(/:(\d+)\s*$/m)?.[1]);
        expect(port).toBeGreaterThan(0);

        let response: Response | undefined;
        for (let attempt = 0; attempt < 60; attempt++) {
          try {
            response = await fetch(`http://127.0.0.1:${port}/`, {
              signal: AbortSignal.timeout(2_000),
            });
            if (response.ok) break;
          } catch {
            await delay(500);
          }
        }
        if (!response?.ok) {
          const { stdout, stderr } = await run(
            'docker',
            ['logs', containerName],
            { quiet: true }
          ).catch(err => ({
            stdout: '',
            stderr: (err as Error).message,
          }));
          throw new Error(
            `Ruby buildpack container did not become ready.\n${stdout}${stderr}`
          );
        }
        expect(response?.status).toBe(200);
        expect(await response?.text()).toContain('hello from ruby buildpacks');
      } finally {
        await run('docker', ['rm', '--force', containerName], {
          quiet: true,
        }).catch(() => undefined);
        await run('docker', ['image', 'rm', '--force', tag], {
          quiet: true,
        }).catch(() => undefined);
        rmSync(workPath, { recursive: true, force: true });
      }
    },
    10 * 60 * 1000
  );
});

describe.skipIf(!runIntegration)('PHP buildpack integration', () => {
  it(
    'builds and serves a PHP application through nginx and PHP-FPM',
    async () => {
      const tag = `vercel-php-buildpack-integration:${process.pid}`;
      const containerName = `vercel-php-buildpack-integration-${process.pid}`;
      const workPath = mkdtempSync(
        join(tmpdir(), 'vercel-php-buildpack-integration-')
      );
      cpSync(join(__dirname, 'fixtures', 'php-web'), workPath, {
        recursive: true,
      });

      try {
        const php = BUILDPACKS.find(bp => bp.runtime === 'php')!;
        await buildWithLifecycle(php, { workPath, tag }, {});
        await run('docker', [
          'run',
          '--detach',
          '--name',
          containerName,
          '--publish',
          '127.0.0.1::8080',
          '--env',
          'PORT=8080',
          tag,
        ]);
        const { stdout } = await run(
          'docker',
          ['port', containerName, '8080/tcp'],
          { quiet: true }
        );
        const port = Number(stdout.match(/:(\d+)\s*$/m)?.[1]);
        expect(port).toBeGreaterThan(0);

        let response: Response | undefined;
        for (let attempt = 0; attempt < 60; attempt++) {
          try {
            response = await fetch(`http://127.0.0.1:${port}/`, {
              signal: AbortSignal.timeout(2_000),
            });
            if (response.ok) break;
          } catch {
            await delay(500);
          }
        }
        if (!response?.ok) {
          const { stdout, stderr } = await run(
            'docker',
            ['logs', containerName],
            { quiet: true }
          ).catch(err => ({
            stdout: '',
            stderr: (err as Error).message,
          }));
          throw new Error(
            `PHP buildpack container did not become ready.\n${stdout}${stderr}`
          );
        }
        expect(await response.text()).toBe('hello from php buildpacks');
      } finally {
        await run('docker', ['rm', '--force', containerName], {
          quiet: true,
        }).catch(() => undefined);
        await run('docker', ['image', 'rm', '--force', tag], {
          quiet: true,
        }).catch(() => undefined);
        rmSync(workPath, { recursive: true, force: true });
      }
    },
    10 * 60 * 1000
  );
});
