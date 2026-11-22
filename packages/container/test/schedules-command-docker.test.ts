import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { dockerEngine } from '../src/engines/docker';
import { buildSchedulesCommandImage } from '../src/schedules-command';

const docker = (...args: string[]) =>
  execFileSync('docker', args, { encoding: 'utf8' }).trim();

const dispatchHeaders = {
  'ce-specversion': '1.0',
  'ce-type': 'com.vercel.schedule.v1beta',
  'ce-source': '/schedule/default/nightly',
  'ce-id': 'execution-id',
  'ce-vssscheduledat': '2026-09-02T12:00:00.000Z',
  'ce-vssscheduleid': 'schedule-id',
  'ce-vssschedulename': 'nightly',
  'ce-vssnamespace': 'default',
  'ce-vssschedulesource': 'static',
};

// Requires Docker and the built dispatcher (`pnpm build`).
it
  .skipIf(process.env.VERCEL_SCHEDULES_COMMAND_DOCKER_TEST !== '1')
  .each([false, true])(
  'runs invocations in a shell-free non-root image (onbuild=%s)',
  async onbuild => {
    const contextDir = await mkdtemp(join(tmpdir(), 'schedules-command-'));
    const imageRef = `vercel-schedules-command-test:${Date.now()}`;
    let container: string | undefined;
    try {
      execFileSync(
        process.env.GO_BIN || 'go',
        [
          'build',
          '-o',
          join(contextDir, 'job'),
          resolve('test/fixtures/command/main.go'),
        ],
        {
          env: {
            ...process.env,
            GOOS: 'linux',
            GOARCH: 'amd64',
            CGO_ENABLED: '0',
          },
        }
      );
      const dockerfilePath = join(contextDir, 'Dockerfile');
      await writeFile(
        dockerfilePath,
        [
          'FROM scratch',
          'COPY job /job',
          'WORKDIR /work',
          'USER 12345',
          'ENV IMAGE_ENV=inherited',
          'ENTRYPOINT ["/must-be-replaced"]',
          ...(onbuild ? ['ONBUILD COPY missing-downstream-file /payload'] : []),
        ].join('\n')
      );
      const built = buildSchedulesCommandImage(
        dockerEngine,
        {
          contextDir,
          dockerfilePath,
          imageRef,
          repository: 'test',
          registry: '',
          username: '',
          token: '',
        },
        resolve('dist/schedules-command-dispatcher')
      );
      if (onbuild) {
        await expect(built).rejects.toThrow('ONBUILD');
        return;
      }
      await built;

      container = docker(
        'run',
        '-d',
        '--platform',
        'linux/amd64',
        '-p',
        '127.0.0.1::3000',
        '-e',
        `VERCEL_SCHEDULE_COMMAND=${JSON.stringify(['/job', 'a b', '', '$HOME'])}`,
        imageRef
      );
      const url = `http://127.0.0.1:${docker('port', container, '3000/tcp').split(':').pop()}`;
      await expect
        .poll(() =>
          fetch(`${url}/_vercel/ping`).then(
            r => r.ok,
            () => false
          )
        )
        .toBe(true);
      for (let invocation = 0; invocation < 2; invocation++) {
        const response = await fetch(url, {
          method: 'POST',
          body: '{}',
          headers: dispatchHeaders,
        });
        expect(response.status).toBe(204);
      }
      expect(
        docker('logs', container)
          .split('\n')
          .map(line => JSON.parse(line))
      ).toEqual(
        Array(2).fill({
          args: ['a b', '', '$HOME'],
          cwd: '/work',
          env: 'inherited',
          uid: 12345,
          schedule: 'nightly',
        })
      );
      expect(docker('exec', container, '/job', 'zombies')).toBe('0');
    } finally {
      if (container) docker('rm', '-f', container);
      docker('image', 'rm', '-f', imageRef);
      await rm(contextDir, { recursive: true, force: true });
    }
  }
);
