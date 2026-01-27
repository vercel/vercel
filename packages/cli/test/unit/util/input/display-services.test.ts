import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResolvedService } from '@vercel/fs-detectors';

// Mock the output manager
vi.mock('../../../../src/output-manager', () => ({
  default: {
    print: vi.fn(),
  },
}));

import {
  displayDetectedServices,
  displayServicesConfigNote,
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
        runtime: 'next',
        isStaticBuild: false,
      },
      {
        name: 'backend',
        type: 'web',
        workspace: 'api',
        routePrefix: '/api',
        entrypoint: 'index.py',
        builder: { src: 'api/index.py', use: '@vercel/python' },
        runtime: 'python',
        isStaticBuild: false,
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
        isStaticBuild: false,
      },
    ];

    displayDetectedServices(services);

    // Should show runtime but not framework
    const calls = (output.print as ReturnType<typeof vi.fn>).mock.calls;
    const serviceLine = calls[1][0];
    expect(serviceLine).toContain('api');
    expect(serviceLine).toContain('[node]');
    expect(serviceLine).toContain('/api/*');
    expect(serviceLine).not.toContain('('); // No framework
  });

  it('should display full-stack framework with builder', () => {
    const services: ResolvedService[] = [
      {
        name: 'web',
        type: 'web',
        workspace: '.',
        routePrefix: '/',
        framework: 'nextjs',
        builder: { src: 'package.json', use: '@vercel/next' },
        runtime: 'next',
        isStaticBuild: false,
      },
    ];

    displayDetectedServices(services);

    const calls = (output.print as ReturnType<typeof vi.fn>).mock.calls;
    const serviceLine = calls[1][0];
    expect(serviceLine).toContain('web');
    expect(serviceLine).toContain('[next]'); // Shows actual builder name
    expect(serviceLine).toContain('(Next.js)');
    expect(serviceLine).toContain('/');
  });

  it('should NOT show runtime for static/SPA frameworks', () => {
    const services: ResolvedService[] = [
      {
        name: 'frontend',
        type: 'web',
        workspace: '.',
        routePrefix: '/',
        framework: 'vite',
        builder: { src: 'package.json', use: '@vercel/static-build' },
        runtime: undefined, // No runtime for static builds
        isStaticBuild: true,
      },
    ];

    displayDetectedServices(services);

    const calls = (output.print as ReturnType<typeof vi.fn>).mock.calls;
    const serviceLine = calls[1][0];
    expect(serviceLine).toContain('frontend');
    expect(serviceLine).toContain('(Vite)');
    expect(serviceLine).not.toContain('[node]'); // No runtime for static builds
    expect(serviceLine).not.toContain('[static]');
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
        isStaticBuild: false,
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
        isStaticBuild: false,
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
        isStaticBuild: false,
      },
    ];

    displayDetectedServices(services);

    const calls = (output.print as ReturnType<typeof vi.fn>).mock.calls;
    const serviceLine = calls[1][0];
    expect(serviceLine).toContain('[python]');
    expect(serviceLine).toContain('(FastAPI)');
  });

  it('should show mixed services with correct builder display', () => {
    const services: ResolvedService[] = [
      {
        name: 'frontend',
        type: 'web',
        workspace: '.',
        routePrefix: '/',
        framework: 'vite',
        builder: { src: 'package.json', use: '@vercel/static-build' },
        runtime: undefined,
        isStaticBuild: true,
      },
      {
        name: 'express-api',
        type: 'web',
        workspace: '.',
        routePrefix: '/express-api',
        entrypoint: 'index.ts',
        builder: { src: 'index.ts', use: '@vercel/express' },
        runtime: 'node',
        isStaticBuild: false,
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
        isStaticBuild: false,
      },
    ];

    displayDetectedServices(services);

    const calls = (output.print as ReturnType<typeof vi.fn>).mock.calls;

    // frontend - static/SPA, no builder
    const frontendLine = calls[1][0];
    expect(frontendLine).toContain('frontend');
    expect(frontendLine).toContain('(Vite)');
    expect(frontendLine).not.toContain('[');

    // express-api - shows runtime, not builder name
    const expressLine = calls[2][0];
    expect(expressLine).toContain('express-api');
    expect(expressLine).toContain('[node]');

    // fastapi-api - builder with framework
    const fastapiLine = calls[3][0];
    expect(fastapiLine).toContain('fastapi-api');
    expect(fastapiLine).toContain('[python]');
    expect(fastapiLine).toContain('(FastAPI)');
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
    expect(call).toContain('Services are configured via vercel.json.');
  });
});
