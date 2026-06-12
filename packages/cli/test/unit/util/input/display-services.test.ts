import { beforeEach, describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import type {
  ExperimentalService,
  ExperimentalServiceV2,
} from '@vercel/fs-detectors';
import { displayDetectedServices } from '../../../../src/util/input/display-services';
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
