import { detectDaemons, detectServices } from '../src';
import VirtualFilesystem from './virtual-file-system';

const daemon = {
  root: 'worker',
  entrypoint: 'Dockerfile',
  replicas: { iad1: 1 },
};

describe('detectDaemons', () => {
  it('reads daemons and their entrypoints from vercel.json', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': JSON.stringify({
        services: { web: { root: 'web', framework: 'nextjs' } },
        daemons: {
          worker: daemon,
          heartbeat: { ...daemon, entrypoint: 'Containerfile.heartbeat' },
        },
      }),
    });

    expect(await detectDaemons({ fs })).toStrictEqual([
      { name: 'worker', entrypoint: 'Dockerfile' },
      { name: 'heartbeat', entrypoint: 'Containerfile.heartbeat' },
    ]);
  });

  it('reads daemons from vercel.toml', async () => {
    const fs = new VirtualFilesystem({
      'vercel.toml': [
        '[daemons.worker]',
        'root = "worker"',
        'entrypoint = "Dockerfile"',
        '',
        '[daemons.worker.replicas]',
        'iad1 = 1',
      ].join('\n'),
    });

    expect(await detectDaemons({ fs })).toStrictEqual([
      { name: 'worker', entrypoint: 'Dockerfile' },
    ]);
  });

  it('reads daemons from a nested workPath', async () => {
    const fs = new VirtualFilesystem({
      'app/vercel.json': JSON.stringify({ daemons: { worker: daemon } }),
    });

    expect(await detectDaemons({ fs, workPath: 'app' })).toStrictEqual([
      { name: 'worker', entrypoint: 'Dockerfile' },
    ]);
  });

  it('returns no daemons when there is no config', async () => {
    const fs = new VirtualFilesystem({});

    expect(await detectDaemons({ fs })).toEqual([]);
  });

  it('returns no daemons when daemons are absent or malformed', async () => {
    for (const daemons of [undefined, null, [], 'worker']) {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({ daemons }),
      });

      expect(await detectDaemons({ fs })).toEqual([]);
    }
  });

  it('omits an entrypoint that is not a string', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': JSON.stringify({
        daemons: { worker: { ...daemon, entrypoint: 42 }, heartbeat: 'x' },
      }),
    });

    expect(await detectDaemons({ fs })).toStrictEqual([
      { name: 'worker' },
      { name: 'heartbeat' },
    ]);
  });

  it('returns no daemons when vercel.json is invalid', async () => {
    const fs = new VirtualFilesystem({ 'vercel.json': '{' });

    expect(await detectDaemons({ fs })).toEqual([]);
  });

  it('is separate from detectServices, which can use a loaded config', async () => {
    // `detectServices` may resolve services from `configuredServices` (e.g. a
    // compiled vercel.ts), so it doesn't report daemons read from disk.
    const fs = new VirtualFilesystem({
      'vercel.json': JSON.stringify({
        services: { web: { root: 'web', framework: 'nextjs' } },
        daemons: { worker: daemon },
      }),
    });

    const result = await detectServices({ fs });

    expect(result.source).toBe('configured');
    expect(result).not.toHaveProperty('daemons');
  });
});
