import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import type { FileBlob, Files } from '@vercel/build-utils';
import {
  getBuildDiagnosticsFramework,
  writeManifests,
} from '@vercel-internals/cli-builder-integration/manifest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readBlob(files: Files, key: string): unknown {
  const blob = files[key] as FileBlob | undefined;
  if (!blob) return undefined;
  return JSON.parse(blob.data as string);
}

const outputDir = join(tmpdir(), 'vc-manifest-test');

function pythonManifest(extra: Record<string, unknown> = {}) {
  return { version: '20260304', runtime: 'python', dependencies: [], ...extra };
}

function nodeManifest(extra: Record<string, unknown> = {}) {
  return { version: '20260304', runtime: 'node', dependencies: [], ...extra };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('writeManifests', () => {
  let diagnostics: Files;
  let ops: Promise<Error | void>[];

  beforeEach(() => {
    diagnostics = {};
    ops = [];
  });

  it('emits nothing when packageManifests is empty', async () => {
    await writeManifests([], diagnostics, ops, outputDir);
    expect(diagnostics['deploy-manifest.json']).toBeUndefined();
    expect(diagnostics['project-manifest.json']).toBeUndefined();
  });

  describe('deploy-manifest framework field', () => {
    it('reflects the framework the builder wrote in its package manifest', async () => {
      await writeManifests(
        [
          {
            workspace: '.',
            key: '@vercel/next:.',
            diagnosticsValues: { framework: 'nextjs' },
            manifest: nodeManifest({ framework: 'nextjs' }),
            builderUse: '@vercel/next',
          },
        ],
        diagnostics,
        ops,
        outputDir
      );

      const deploy = readBlob(diagnostics, 'deploy-manifest.json') as any;
      expect(deploy.builds['@vercel/next:.'].runtime).toBe('node');
      expect(deploy.builds['@vercel/next:.'].framework).toBe('nextjs');
    });

    it('produces a separate entry per builder', async () => {
      await writeManifests(
        [
          {
            workspace: '.',
            key: '@vercel/next:.',
            diagnosticsValues: { framework: 'nextjs' },
            manifest: nodeManifest({ framework: 'nextjs' }),
            builderUse: '@vercel/next',
          },
          {
            workspace: '.',
            key: '@vercel/python:.',
            diagnosticsValues: { framework: 'fastapi' },
            manifest: pythonManifest({ framework: 'fastapi' }),
            builderUse: '@vercel/python',
          },
        ],
        diagnostics,
        ops,
        outputDir
      );

      const deploy = readBlob(diagnostics, 'deploy-manifest.json') as any;
      expect(deploy.builds['@vercel/next:.'].framework).toBe('nextjs');
      expect(deploy.builds['@vercel/python:.'].framework).toBe('fastapi');
    });
  });

  describe('diagnostics blobs', () => {
    it('populates both deploy-manifest and project-manifest entries', async () => {
      await writeManifests(
        [
          {
            workspace: '.',
            key: '@vercel/next:.',
            diagnosticsValues: { framework: 'nextjs' },
            manifest: nodeManifest({ framework: 'nextjs' }),
            builderUse: '@vercel/next',
          },
        ],
        diagnostics,
        ops,
        outputDir
      );

      expect(diagnostics['deploy-manifest.json']).toMatchObject({
        type: 'FileBlob',
      });
      expect(diagnostics['project-manifest.json']).toMatchObject({
        type: 'FileBlob',
      });
    });
  });
});

describe('getBuildDiagnosticsFramework', () => {
  it('does not resolve the "services" project preset', () => {
    expect(
      getBuildDiagnosticsFramework({
        service: {
          schema: 'experimentalServicesV2',
          name: 'site',
          root: 'site',
          builder: { use: '@vercel/static', src: 'site/**' },
        },
        configFramework: 'services',
        apiDirFramework: undefined,
      })
    ).toBeUndefined();
  });

  it('falls back to the runtime preset for services without a framework', () => {
    expect(
      getBuildDiagnosticsFramework({
        service: {
          schema: 'experimentalServicesV2',
          name: 'api',
          root: 'api',
          runtime: 'go',
          builder: { use: '@vercel/go', src: 'api/main.go' },
        },
        configFramework: 'services',
        apiDirFramework: undefined,
      })
    ).toBe('go');
  });

  it('prefers the service framework over the runtime preset', () => {
    expect(
      getBuildDiagnosticsFramework({
        service: {
          schema: 'experimentalServicesV2',
          name: 'api',
          root: 'api',
          framework: 'fastapi',
          runtime: 'python',
          builder: { use: '@vercel/python', src: 'api/main.py' },
        },
        configFramework: 'fastapi',
        apiDirFramework: undefined,
      })
    ).toBe('fastapi');
  });

  it('resolves other frameworks from config', () => {
    expect(
      getBuildDiagnosticsFramework({
        service: undefined,
        configFramework: 'nextjs',
        apiDirFramework: undefined,
      })
    ).toBe('nextjs');
  });
});
