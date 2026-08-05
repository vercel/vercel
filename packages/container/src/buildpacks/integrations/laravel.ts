import type { FrameworkBuildpackIntegration } from '../registry';

const ADAPTER_VERSION = '0.1.0';
const ADAPTER_COMMIT = '4f156be279b7bf8a0ebd9def493817170a0385bc';

const packageRepository = JSON.stringify({
  type: 'package',
  package: {
    name: 'vercel/laravel',
    version: ADAPTER_VERSION,
    dist: {
      type: 'zip',
      url: `https://github.com/jacobparis/vercel-laravel/archive/${ADAPTER_COMMIT}.zip`,
      reference: ADAPTER_COMMIT,
    },
    autoload: {
      'psr-4': {
        'Vercel\\Laravel\\': 'src/',
      },
    },
    extra: {
      laravel: {
        providers: ['Vercel\\Laravel\\VercelServiceProvider'],
      },
    },
  },
});

/**
 * Laravel-specific platform glue, expressed as a normal CNB buildpack.
 *
 * It runs after Paketo PHP, when Composer is available, and changes only the
 * lifecycle's staged /workspace copy. The repository checkout and its lockfile
 * are never modified. Replace the pinned package repository with the official
 * Packagist release before this integration leaves its experimental gate.
 */
export const LARAVEL_INTEGRATION: FrameworkBuildpackIntegration = {
  buildpack: {
    id: 'vercel/laravel',
    version: '0.1.0',
    files: {
      'buildpack.toml': `api = "0.10"

[buildpack]
id = "vercel/laravel"
version = "0.1.0"
name = "Vercel Laravel Integration"

[[stacks]]
id = "io.buildpacks.stacks.jammy"
`,
      'bin/detect': `#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f artisan || ! -f composer.json ]]; then
  exit 100
fi

grep -Eq '"laravel/framework"[[:space:]]*:' composer.json || exit 100
`,
      'bin/build': `#!/usr/bin/env bash
set -euo pipefail

if composer show vercel/laravel --no-interaction >/dev/null 2>&1; then
  echo "Vercel Laravel adapter already installed"
  exit 0
fi

echo "Installing Vercel Laravel service adapters into the staged build"
composer config --json repositories.vercel-laravel '${packageRepository}'
composer require vercel/laravel:${ADAPTER_VERSION} --no-update --no-interaction
composer update vercel/laravel \
  --no-dev \
  --no-interaction \
  --no-progress \
  --prefer-dist \
  --optimize-autoloader \
  --minimal-changes
`,
    },
  },
  launchEnvDefaults: {
    FILESYSTEM_DISK: 'vercel',
    QUEUE_CONNECTION: 'vercel',
    VERCEL_QUEUE_TOPIC: 'laravel',
  },
  defaultTriggers: [{ type: 'queue/v2beta', topic: 'laravel' }],
};
