import { beforeEach, describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import type {
  ExperimentalService,
  ExperimentalServiceV2,
} from '@vercel/build-utils';
import {
  displayDetectedDaemons,
  displayDetectedServices,
  displayServicesConfigNote,
  getNameColumnWidth,
} from '../../../../src/util/input/display-services';
import { client } from '../../../mocks/client';

describe('displayDetectedServices', () => {
  beforeEach(() => {
    client.reset();
  });

  it('renders `experimentalServices` web services with their route prefix', () => {
    const services = [
      {
        schema: 'experimentalServices',
        name: 'frontend',
        type: 'web',
        workspace: 'frontend',
        framework: 'nextjs',
        routePrefix: '/',
        builder: { use: '@vercel/next', src: 'frontend/package.json' },
      },
      {
        schema: 'experimentalServices',
        name: 'api',
        type: 'web',
        workspace: 'api',
        runtime: 'python',
        routePrefix: '/api',
        builder: { use: '@vercel/python', src: 'api/index.py' },
      },
    ] as ExperimentalService[];

    displayDetectedServices(services);

    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain('Detected services:');
    expect(output).toContain('frontend');
    expect(output).toContain('[Next.js]');
    expect(output).toContain('/api/*');
  });

  it('renders `experimentalServicesV2` services by name (no route prefix)', () => {
    const services = [
      {
        schema: 'experimentalServicesV2',
        name: 'my_frontend',
        root: 'frontend',
        framework: 'nextjs',
        builder: { use: '@vercel/next', src: 'frontend/package.json' },
      },
      {
        schema: 'experimentalServicesV2',
        name: 'my_backend',
        root: 'backend',
        runtime: 'python',
        builder: { use: '@vercel/python', src: 'backend/main.py' },
      },
    ] as ExperimentalServiceV2[];

    displayDetectedServices(services);

    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain('Detected services:');
    expect(output).toContain('my_frontend');
    expect(output).toContain('[Next.js]');
    expect(output).toContain('my_backend');
    expect(output).toContain('[python]');
  });
});

describe('displayDetectedDaemons', () => {
  beforeEach(() => {
    client.reset();
  });

  it('renders each daemon with its entrypoint', () => {
    displayDetectedDaemons([
      { name: 'worker', entrypoint: 'Dockerfile' },
      { name: 'heartbeat', entrypoint: 'Containerfile.heartbeat' },
    ]);

    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain('Detected daemons:');
    expect(output).toMatch(/• worker\s+\[Dockerfile\]/);
    expect(output).toMatch(/• heartbeat\s+\[Containerfile\.heartbeat\]/);
    expect(output).not.toContain('Detected services');
  });

  it('marks a daemon without a string entrypoint as unknown', () => {
    displayDetectedDaemons([{ name: 'worker' }]);

    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toMatch(/• worker\s+\[unknown\]/);
  });

  it('lines up with the services table when given a shared name width', () => {
    const services = [
      {
        schema: 'experimentalServicesV2',
        name: 'web',
        root: 'web',
        framework: 'nextjs',
        builder: { use: '@vercel/next', src: 'web/package.json' },
      },
    ] as ExperimentalServiceV2[];
    const daemons = [
      { name: 'long-running-indexer', entrypoint: 'Dockerfile' },
    ];
    const nameWidth = getNameColumnWidth(['web', 'long-running-indexer']);

    displayDetectedServices(services, nameWidth);
    displayDetectedDaemons(daemons, nameWidth);

    const lines = stripAnsi(client.stderr.getFullOutput()).split('\n');
    const bracketColumn = (name: string) =>
      lines.find(line => line.includes(`• ${name} `))?.indexOf('[');
    expect(nameWidth).toBe('• long-running-indexer'.length);
    expect(bracketColumn('web')).toBeGreaterThan('• web'.length);
    expect(bracketColumn('web')).toBe(bracketColumn('long-running-indexer'));
  });
});

describe('displayServicesConfigNote', () => {
  beforeEach(() => {
    client.reset();
  });

  it('mentions only services when there are no daemons', () => {
    displayServicesConfigNote('vercel.json');

    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain('Services are configured via vercel.json.');
    expect(output).not.toContain('daemons');
  });

  it('mentions daemons when the config has them', () => {
    displayServicesConfigNote('vercel.ts', true);

    const output = stripAnsi(client.stderr.getFullOutput());
    expect(output).toContain(
      'Services and daemons are configured via vercel.ts.'
    );
  });
});
