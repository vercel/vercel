import { describe, expect, it } from 'vitest';
import { getDaemonImageRepository, getDaemonNames } from '../src';

describe('getDaemonNames', () => {
  it('lists configured daemons', () => {
    expect(
      getDaemonNames({
        daemons: {
          heartbeat: {
            root: 'daemon',
            entrypoint: 'Dockerfile',
            instances: { sfo1: 1 },
          },
          worker: { root: 'worker', entrypoint: 'Dockerfile', instances: {} },
        },
      })
    ).toEqual(['heartbeat', 'worker']);
  });

  it.each([
    undefined,
    null,
    {},
    { daemons: {} },
    { daemons: null },
    { daemons: ['heartbeat'] },
    { daemons: 'heartbeat' },
  ])('returns no names for %j', config => {
    expect(getDaemonNames(config)).toEqual([]);
  });
});

describe('getDaemonImageRepository', () => {
  it.each([
    ['heartbeat', 'daemon.heartbeat'],
    ['celery_worker', 'daemon.celery_worker'],
    ['a--b', 'daemon.a-b'],
  ])('names the repository for %s', (name, repository) => {
    expect(getDaemonImageRepository(name)).toBe(repository);
  });

  it('never matches a service repository', () => {
    // Service names match `^[a-z]([a-z_-]*[a-z])?$`, so they can't contain `.`.
    expect(getDaemonImageRepository('web')).toContain('.');
  });
});
