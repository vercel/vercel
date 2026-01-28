import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResolvedService } from '@vercel/fs-detectors';

// Mock the output manager
vi.mock('../../../../src/output-manager', () => ({
  default: {
    print: vi.fn(),
    warn: vi.fn(),
  },
}));

import {
  displayDetectedServices,
  displayServicesConfigNote,
  displayServiceErrors,
} from '../../../../src/util/input/display-services';
import output from '../../../../src/output-manager';

describe('displayDetectedServices()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display header and services list', () => {
    const services: ResolvedService[] = [
      {
        name: 'frontend',
        type: 'web',
        workspace: '.',
        routePrefix: '/',
        framework: 'nextjs',
        builder: { src: 'package.json', use: '@vercel/next' },
        runtime: 'node',
      },
      {
        name: 'backend',
        type: 'web',
        workspace: 'api',
        routePrefix: '/api',
        entrypoint: 'index.py',
        builder: { src: 'api/index.py', use: '@vercel/python' },
        runtime: 'python',
      },
    ];

    displayDetectedServices(services);

    expect(output.print).toHaveBeenCalledWith(
      'Multiple services detected. Project Settings:\n'
    );

    // Check that output.print was called for each service
    expect(output.print).toHaveBeenCalledTimes(3); // 1 header + 2 services
  });

  it('should display runtime service without framework', () => {
    const services: ResolvedService[] = [
      {
        name: 'api',
        type: 'web',
        workspace: '.',
        routePrefix: '/api',
        entrypoint: 'index.ts',
        builder: { src: 'index.ts', use: '@vercel/node' },
        runtime: 'node',
      },
    ];

    displayDetectedServices(services);

    // Should show runtime
    const calls = (output.print as ReturnType<typeof vi.fn>).mock.calls;
    const serviceLine = calls[1][0];
    expect(serviceLine).toContain('api');
    expect(serviceLine).toContain('[node]');
    expect(serviceLine).toContain('/api/*');
  });

  it('should display framework name when available', () => {
    const services: ResolvedService[] = [
      {
        name: 'web',
        type: 'web',
        workspace: '.',
        routePrefix: '/',
        framework: 'nextjs',
        builder: { src: 'package.json', use: '@vercel/next' },
        runtime: 'node',
      },
    ];

    displayDetectedServices(services);

    const calls = (output.print as ReturnType<typeof vi.fn>).mock.calls;
    const serviceLine = calls[1][0];
    expect(serviceLine).toContain('web');
    expect(serviceLine).toContain('[Next.js]');
    expect(serviceLine).toContain('/');
  });

  it('should show builder when no framework or runtime', () => {
    const services: ResolvedService[] = [
      {
        name: 'php-api',
        type: 'web',
        workspace: '.',
        routePrefix: '/php',
        entrypoint: 'index.php',
        builder: { src: 'index.php', use: '@vercel/php' },
        runtime: undefined,
      },
    ];

    displayDetectedServices(services);

    const calls = (output.print as ReturnType<typeof vi.fn>).mock.calls;
    const serviceLine = calls[1][0];
    expect(serviceLine).toContain('php-api');
    expect(serviceLine).toContain('[@vercel/php]');
    expect(serviceLine).toContain('/php/*');
  });

  it('should format root prefix as /', () => {
    const services: ResolvedService[] = [
      {
        name: 'root',
        type: 'web',
        workspace: '.',
        routePrefix: '/',
        entrypoint: 'index.ts',
        builder: { src: 'index.ts', use: '@vercel/node' },
        runtime: 'node',
      },
    ];

    displayDetectedServices(services);

    const calls = (output.print as ReturnType<typeof vi.fn>).mock.calls;
    const serviceLine = calls[1][0];
    // Root prefix should end with "→ /" followed by newline
    expect(serviceLine).toContain('→ /');
    expect(serviceLine).not.toContain('/*');
  });

  it('should format non-root prefix with /*', () => {
    const services: ResolvedService[] = [
      {
        name: 'api',
        type: 'web',
        workspace: '.',
        routePrefix: '/backend',
        entrypoint: 'index.ts',
        builder: { src: 'index.ts', use: '@vercel/node' },
        runtime: 'node',
      },
    ];

    displayDetectedServices(services);

    const calls = (output.print as ReturnType<typeof vi.fn>).mock.calls;
    const serviceLine = calls[1][0];
    expect(serviceLine).toContain('/backend/*');
  });

  it('should identify python runtime with FastAPI', () => {
    const services: ResolvedService[] = [
      {
        name: 'fastapi',
        type: 'web',
        workspace: '.',
        routePrefix: '/api',
        framework: 'fastapi',
        entrypoint: 'main.py',
        builder: { src: 'main.py', use: '@vercel/python' },
        runtime: 'python',
      },
    ];

    displayDetectedServices(services);

    const calls = (output.print as ReturnType<typeof vi.fn>).mock.calls;
    const serviceLine = calls[1][0];
    // Should prioritize framework name over runtime
    expect(serviceLine).toContain('[FastAPI]');
  });

  it('should show mixed services with correct display', () => {
    const services: ResolvedService[] = [
      {
        name: 'frontend',
        type: 'web',
        workspace: '.',
        routePrefix: '/',
        framework: 'vite',
        builder: { src: 'package.json', use: '@vercel/static-build' },
        runtime: undefined,
      },
      {
        name: 'node-api',
        type: 'web',
        workspace: '.',
        routePrefix: '/node-api',
        entrypoint: 'index.ts',
        builder: { src: 'index.ts', use: '@vercel/node' },
        runtime: 'node',
      },
      {
        name: 'fastapi-api',
        type: 'web',
        workspace: '.',
        routePrefix: '/fastapi-api',
        framework: 'fastapi',
        entrypoint: 'main.py',
        builder: { src: 'main.py', use: '@vercel/python' },
        runtime: 'python',
      },
    ];

    displayDetectedServices(services);

    const calls = (output.print as ReturnType<typeof vi.fn>).mock.calls;

    // frontend - Vite framework
    const frontendLine = calls[1][0];
    expect(frontendLine).toContain('frontend');
    expect(frontendLine).toContain('[Vite]');

    // node-api - runtime only
    const nodeLine = calls[2][0];
    expect(nodeLine).toContain('node-api');
    expect(nodeLine).toContain('[node]');

    // fastapi-api - FastAPI framework
    const fastapiLine = calls[3][0];
    expect(fastapiLine).toContain('fastapi-api');
    expect(fastapiLine).toContain('[FastAPI]');
  });
});

describe('displayServicesConfigNote()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display configuration note', () => {
    displayServicesConfigNote();

    expect(output.print).toHaveBeenCalledTimes(1);
    const call = (output.print as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call).toContain('Services');
    expect(call).toContain('experimental');
    expect(call).toContain('vercel.json');
  });
});

describe('displayServiceErrors()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display service validation errors', () => {
    const errors = [
      {
        code: 'MISSING_ROUTE_PREFIX',
        message: 'Service "api" must specify "routePrefix".',
      },
      {
        code: 'INVALID_FRAMEWORK',
        message: 'Service "web" has invalid framework "unknown".',
      },
    ];

    displayServiceErrors(errors);

    expect(output.warn).toHaveBeenCalledTimes(2);
    expect(output.warn).toHaveBeenCalledWith(
      'Service "api" must specify "routePrefix".'
    );
    expect(output.warn).toHaveBeenCalledWith(
      'Service "web" has invalid framework "unknown".'
    );
  });

  it('should not call warn when no errors', () => {
    displayServiceErrors([]);

    expect(output.warn).not.toHaveBeenCalled();
  });
});
