import { detectInstrumentation } from '../src/detect-instrumentation';
import VirtualFilesystem from './virtual-file-system';

describe('detectInstrumentation()', () => {
  it('returns false when package.json does not exist', async () => {
    const fs = new VirtualFilesystem({});
    expect(await detectInstrumentation(fs)).toBe(false);
  });

  it('returns false when no instrumentation dependencies are found', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          react: '^18.0.0',
          next: '^12.0.0',
        },
      }),
    });
    expect(await detectInstrumentation(fs)).toBe(false);
  });

  it('returns true when @vercel/otel with valid version is found', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          '@vercel/otel': '1.11.0',
        },
      }),
    });

    // Spy on process.env to ensure it's set properly
    const originalEnv = process.env;
    process.env = { ...originalEnv };

    expect(await detectInstrumentation(fs)).toBe(true);

    // Restore original env
    process.env = originalEnv;
  });

  it('returns true when @opentelemetry/sdk-trace-node with valid version is found', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          '@opentelemetry/sdk-trace-node': '1.19.0',
        },
      }),
    });

    // Spy on process.env to ensure it's set properly
    const originalEnv = process.env;
    process.env = { ...originalEnv };

    expect(await detectInstrumentation(fs)).toBe(true);

    // Restore original env
    process.env = originalEnv;
  });

  it('returns true when @opentelemetry/api with valid version is found', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          '@opentelemetry/api': '1.7.0',
        },
      }),
    });

    // Spy on process.env to ensure it's set properly
    const originalEnv = process.env;
    process.env = { ...originalEnv };

    expect(await detectInstrumentation(fs)).toBe(true);

    // Restore original env
    process.env = originalEnv;
  });

  it('returns false when @vercel/otel version is too old', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          '@vercel/otel': '1.10.0', // below minimum 1.11.0
        },
      }),
    });
    expect(await detectInstrumentation(fs)).toBe(false);
  });

  it('returns false when @opentelemetry/api version is too old', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: {
          '@opentelemetry/api': '1.6.0', // below minimum 1.7.0
        },
      }),
    });
    expect(await detectInstrumentation(fs)).toBe(false);
  });

  it('works with devDependencies too', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        devDependencies: {
          '@opentelemetry/sdk-trace-node': '1.20.0',
        },
      }),
    });

    // Spy on process.env to ensure it's set properly
    const originalEnv = process.env;
    process.env = { ...originalEnv };

    expect(await detectInstrumentation(fs)).toBe(true);

    // Restore original env
    process.env = originalEnv;
  });
});
