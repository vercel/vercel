import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import type { BuildResultV2Typical } from '@vercel/build-utils';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build } from '../src';
import { generateDockerfile } from '../src/dockerfile';
import { inspectLaravelProject, resolvePhpVersion } from '../src/project';

const directories: string[] = [];
const containerBuild = vi.hoisted(() => vi.fn());

vi.mock('@vercel/container', () => ({
  buildWithContainerSource: containerBuild,
  diagnostics: vi.fn(),
  prepareCache: vi.fn(),
  startDevServerWithContainerSource: vi.fn(),
}));

function fixture(files: Record<string, string>): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'laravel-builder-test-'));
  directories.push(directory);
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(path.join(directory, name), contents);
  }
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('@vercel/laravel', () => {
  it('selects the newest supported PHP release matching Composer', () => {
    expect(resolvePhpVersion('^8.2')).toBe('8.5');
    expect(resolvePhpVersion('~8.3.0')).toBe('8.3');
    expect(resolvePhpVersion('>=8.2, <8.5')).toBe('8.4');
    expect(() => resolvePhpVersion('^7.4')).toThrow(
      'supports 8.5, 8.4, 8.3, 8.2'
    );
  });

  it('inspects a stock Laravel application and its frontend tooling', () => {
    const workPath = fixture({
      artisan: '#!/usr/bin/env php',
      'composer.json': JSON.stringify({
        require: {
          php: '^8.2',
          'laravel/framework': '^13.0',
          'laravel/wayfinder': '^0.1',
          'vercel/laravel': '^0.1',
          'ext-gd': '*',
        },
        extra: {
          vercel: {
            queues: [
              {
                topic: 'laravel',
                maxConcurrency: 10,
                retryAfterSeconds: 30,
              },
            ],
          },
        },
      }),
      'composer.lock': JSON.stringify({
        packages: [
          {
            name: 'laravel/framework',
            version: 'v13.18.0',
            require: { 'ext-curl': '*' },
          },
        ],
      }),
      'package.json': JSON.stringify({ scripts: { build: 'vite build' } }),
      'pnpm-lock.yaml': 'lockfileVersion: 9',
    });

    const project = inspectLaravelProject(workPath);
    expect(project).toMatchObject({
      laravelVersion: '13.18.0',
      phpVersion: '8.5',
      composerLock: true,
      packageManager: 'pnpm',
      packageLock: 'pnpm-lock.yaml',
      hasAssetBuild: true,
      hasWayfinder: true,
      hasVercelAdapter: true,
      queueTriggers: [
        {
          topic: 'laravel',
          maxConcurrency: 10,
          retryAfterSeconds: 30,
        },
      ],
    });
    expect(project.extensions.has('gd')).toBe(true);
    expect(project.extensions.has('curl')).toBe(true);
  });

  it('generates an Apache image with Composer, Vite, and stateless defaults', () => {
    const dockerfile = generateDockerfile(
      {
        laravelVersion: '13.18.0',
        phpVersion: '8.5',
        composerLock: true,
        packageManager: 'npm',
        packageLock: 'package-lock.json',
        hasAssetBuild: true,
        hasWayfinder: false,
        hasVercelAdapter: false,
        extensions: new Set(['gd', 'redis']),
        queueTriggers: [],
      },
      { VITE_PUBLIC_NAME: 'demo', SECRET: 'not-a-build-arg' }
    );

    expect(dockerfile).toContain(
      'FROM ghcr.io/jacobparis/vercel-laravel-php@sha256:13ae0b0cb745cd50018e96b8abd1990ccaec3505926057985f3874950e81b08c'
    );
    expect(dockerfile).not.toContain('libicu-dev');
    expect(dockerfile).toContain('docker-php-ext-install');
    expect(dockerfile).not.toContain('curl dom');
    expect(dockerfile).not.toContain('pdo_sqlite');
    expect(dockerfile).toContain(
      'SetEnvIf X-Forwarded-Proto "^https$" HTTPS=on'
    );
    expect(dockerfile).toContain('docker-php-ext-configure gd');
    expect(dockerfile).toContain('pecl install redis');
    expect(dockerfile).toContain('COPY package.json package-lock.json ./');
    expect(dockerfile).toContain('RUN npm ci');
    expect(dockerfile).toContain('RUN npm run build');
    expect(dockerfile).toContain('ARG VITE_PUBLIC_NAME');
    expect(dockerfile).not.toContain('ARG SECRET');
    expect(dockerfile).toContain('SESSION_DRIVER=cookie');
    expect(dockerfile).toContain('QUEUE_CONNECTION=sync');
    expect(dockerfile).toContain('CMD ["apache2-foreground"]');

    const adapted = generateDockerfile({
      laravelVersion: '13.18.0',
      phpVersion: '8.5',
      composerLock: true,
      hasAssetBuild: false,
      hasWayfinder: true,
      hasVercelAdapter: true,
      extensions: new Set(),
      queueTriggers: [{ topic: 'laravel' }],
    });
    expect(adapted).toContain(
      'php -d memory_limit=512M artisan wayfinder:generate --ansi'
    );
    expect(adapted).toContain('FILESYSTEM_DISK=vercel');
    expect(adapted).toContain('QUEUE_CONNECTION=vercel');
    expect(adapted).not.toContain('docker-php-ext-install');

    const fallback = generateDockerfile({
      laravelVersion: '12.0.0',
      phpVersion: '8.4',
      composerLock: true,
      hasAssetBuild: false,
      hasWayfinder: false,
      hasVercelAdapter: false,
      extensions: new Set(),
      queueTriggers: [],
    });
    expect(fallback).toContain('FROM php:8.4-apache-bookworm');
    expect(fallback).toContain('docker-php-ext-install');
  });

  it('delegates a generated recipe and reports the Laravel version', async () => {
    const workPath = fixture({
      artisan: '#!/usr/bin/env php',
      'composer.json': JSON.stringify({
        require: { php: '^8.2', 'laravel/framework': '^13.0' },
      }),
      'composer.lock': JSON.stringify({
        packages: [{ name: 'laravel/framework', version: 'v13.18.0' }],
      }),
    });
    let generatedPath = '';
    containerBuild.mockImplementationOnce(
      async (options: { config: Record<string, unknown> }, source: any) => {
        generatedPath = source.dockerfilePath;
        expect(options.config.framework).toBe('laravel');
        expect(source.contextDir).toBe(workPath);
        expect(source.functionSource).toBe('artisan');
        expect(readFileSync(source.dockerfilePath, 'utf8')).toContain(
          'FROM ghcr.io/jacobparis/vercel-laravel-php@sha256:13ae0b0cb745cd50018e96b8abd1990ccaec3505926057985f3874950e81b08c'
        );
        return { output: {} };
      }
    );

    const result = await build({
      files: {},
      entrypoint: '<detect>',
      workPath,
      repoRootPath: workPath,
      config: {},
    } as any);

    expect(result).toMatchObject({
      framework: { slug: 'laravel', version: '13.18.0' },
    });
    expect(existsSync(generatedPath)).toBe(false);
  });

  it('emits a private push consumer when the Laravel adapter is installed', async () => {
    const workPath = fixture({
      artisan: '#!/usr/bin/env php',
      'composer.json': JSON.stringify({
        require: {
          php: '^8.2',
          'laravel/framework': '^13.0',
          'vercel/laravel': '^0.1',
        },
      }),
    });
    containerBuild.mockResolvedValueOnce({
      routes: [{ src: '/(.*)', dest: '/index' }],
      output: {
        index: {
          type: 'Lambda',
          runtime: 'container',
          handler: 'registry.example/laravel@sha256:test',
          environment: {},
        },
      },
    });

    const result = (await build({
      files: {},
      entrypoint: '<detect>',
      workPath,
      repoRootPath: workPath,
      config: {},
    } as any)) as BuildResultV2Typical;

    expect(result.routes).toEqual([{ src: '/(.*)', dest: '/index' }]);
    expect(result.output.__vercel_laravel_queue_0).toMatchObject({
      handler: 'registry.example/laravel@sha256:test',
      environment: { VERCEL_LARAVEL_QUEUE_CALLBACK: '1' },
      experimentalTriggers: [
        {
          type: 'queue/v2beta',
          topic: 'laravel',
          consumer: '____vercel__laravel__queue__0',
        },
      ],
    });
  });
});
