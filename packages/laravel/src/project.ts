import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import semver from 'semver';

export const SUPPORTED_PHP_VERSIONS = ['8.5', '8.4', '8.3', '8.2'] as const;

type JsonObject = Record<string, unknown>;

export interface LaravelProject {
  laravelVersion: string;
  phpVersion: (typeof SUPPORTED_PHP_VERSIONS)[number];
  composerLock: boolean;
  packageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun';
  packageLock?: string;
  packageConfigFiles?: string[];
  packageManagerVersion?: string;
  hasAssetBuild: boolean;
  hasWayfinder: boolean;
  extensions: Set<string>;
  queueTriggers: LaravelQueueTrigger[];
}

export interface LaravelQueueTrigger {
  topic: string;
  initialDelaySeconds?: number;
  maxConcurrency?: number;
  retryAfterSeconds?: number;
}

function readJson(file: string): JsonObject {
  return JSON.parse(readFileSync(file, 'utf8')) as JsonObject;
}

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function composerRangeToSemver(value: string): string {
  return value
    .replace(/\s*\|\|\s*/g, ' || ')
    .replace(/,\s*/g, ' ')
    .replace(/(\d+\.\d+)\.\*/g, '$1.x');
}

export function resolvePhpVersion(
  constraint?: string
): LaravelProject['phpVersion'] {
  if (!constraint) {
    return SUPPORTED_PHP_VERSIONS[0];
  }
  const range = composerRangeToSemver(constraint);
  const matched = SUPPORTED_PHP_VERSIONS.find(version =>
    semver.satisfies(`${version}.0`, range, { includePrerelease: true })
  );
  if (!matched) {
    throw new Error(
      `Laravel requires PHP "${constraint}", but this Vercel runtime supports ` +
        `${SUPPORTED_PHP_VERSIONS.join(', ')}.`
    );
  }
  return matched;
}

function packageManager(workPath: string): {
  packageManager?: LaravelProject['packageManager'];
  packageLock?: string;
} {
  const candidates: Array<
    [LaravelProject['packageManager'], string | string[]]
  > = [
    ['pnpm', 'pnpm-lock.yaml'],
    ['yarn', 'yarn.lock'],
    ['bun', ['bun.lock', 'bun.lockb']],
    ['npm', ['package-lock.json', 'npm-shrinkwrap.json']],
  ];
  for (const [manager, locks] of candidates) {
    for (const lock of Array.isArray(locks) ? locks : [locks]) {
      if (existsSync(path.join(workPath, lock))) {
        return { packageManager: manager, packageLock: lock };
      }
    }
  }
  return existsSync(path.join(workPath, 'package.json'))
    ? { packageManager: 'npm' }
    : {};
}

function queueTriggers(composer: JsonObject): LaravelQueueTrigger[] {
  const configured = object(object(composer.extra).vercel).queues;
  if (configured === false) {
    return [];
  }

  const entries = configured === undefined ? ['laravel'] : configured;
  if (!Array.isArray(entries)) {
    throw new Error(
      '`composer.json` extra.vercel.queues must be an array or false.'
    );
  }

  return entries.map((entry, index) => {
    const value = typeof entry === 'string' ? { topic: entry } : object(entry);
    const topic = string(value.topic);
    if (!topic || !/^[A-Za-z0-9_-]+\*?$/.test(topic)) {
      throw new Error(
        `Invalid Laravel Vercel queue topic at extra.vercel.queues[${index}].`
      );
    }

    const trigger: LaravelQueueTrigger = { topic };
    for (const key of [
      'initialDelaySeconds',
      'maxConcurrency',
      'retryAfterSeconds',
    ] as const) {
      const candidate = value[key];
      if (candidate !== undefined) {
        if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
          throw new Error(
            `Laravel Vercel queue option [${key}] must be a number.`
          );
        }
        trigger[key] = candidate;
      }
    }
    return trigger;
  });
}

export function inspectLaravelProject(workPath: string): LaravelProject {
  const composerPath = path.join(workPath, 'composer.json');
  const artisanPath = path.join(workPath, 'artisan');
  if (!existsSync(composerPath) || !existsSync(artisanPath)) {
    throw new Error(
      'A Laravel project must contain both `composer.json` and `artisan`.'
    );
  }

  const composer = readJson(composerPath);
  const require = object(composer.require);
  const laravelConstraint = string(require['laravel/framework']);
  if (!laravelConstraint) {
    throw new Error(
      '`composer.json` must require `laravel/framework` for zero-config Laravel deployments.'
    );
  }

  const config = object(composer.config);
  const platform = object(config.platform);
  const phpConstraint = string(platform.php) ?? string(require.php);
  const extensions = new Set(
    Object.keys(require)
      .filter(name => name.startsWith('ext-'))
      .map(name => name.slice(4))
  );

  let laravelVersion = laravelConstraint;
  const composerLock = existsSync(path.join(workPath, 'composer.lock'));
  let packages: JsonObject[] = [];
  if (composerLock) {
    const lock = readJson(path.join(workPath, 'composer.lock'));
    packages = Array.isArray(lock.packages)
      ? lock.packages.map(pkg => object(pkg))
      : [];
    for (const pkg of packages) {
      for (const dependency of Object.keys(object(object(pkg).require))) {
        if (dependency.startsWith('ext-')) {
          extensions.add(dependency.slice(4));
        }
      }
    }
    const framework = packages.find(
      pkg => object(pkg).name === 'laravel/framework'
    );
    laravelVersion =
      string(object(framework).version)?.replace(/^v/, '') ?? laravelVersion;
  }

  const assets = packageManager(workPath);
  const packageConfigFiles = [
    '.npmrc',
    ...(assets.packageManager === 'pnpm' ? ['pnpm-workspace.yaml'] : []),
    ...(assets.packageManager === 'yarn' ? ['.yarnrc.yml'] : []),
    ...(assets.packageManager === 'bun' ? ['bunfig.toml'] : []),
  ].filter(file => existsSync(path.join(workPath, file)));
  let packageManagerVersion: string | undefined;
  const hasWayfinder =
    string(require['laravel/wayfinder']) !== undefined ||
    packages.some(pkg => object(pkg).name === 'laravel/wayfinder');
  let hasAssetBuild = false;
  if (assets.packageManager) {
    const packageJson = readJson(path.join(workPath, 'package.json'));
    hasAssetBuild = typeof object(packageJson.scripts).build === 'string';
    const declaredPackageManager = string(packageJson.packageManager);
    const packageManagerPrefix = `${assets.packageManager}@`;
    if (declaredPackageManager?.startsWith(packageManagerPrefix)) {
      packageManagerVersion = declaredPackageManager
        .slice(packageManagerPrefix.length)
        .split('+')[0];
    } else {
      const engine = string(object(packageJson.engines)[assets.packageManager]);
      const minimumVersion = engine ? semver.minVersion(engine) : null;
      packageManagerVersion = minimumVersion
        ? String(minimumVersion.major)
        : undefined;
    }
  }

  return {
    laravelVersion,
    phpVersion: resolvePhpVersion(phpConstraint),
    composerLock,
    ...assets,
    packageConfigFiles,
    packageManagerVersion,
    hasAssetBuild,
    hasWayfinder,
    extensions,
    queueTriggers: queueTriggers(composer),
  };
}
