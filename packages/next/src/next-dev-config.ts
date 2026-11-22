import { spawn } from 'child_process';
import { getNodeExecPath, NowBuildError } from '@vercel/build-utils';

export interface NextDevRoutingConfig {
  basePath: string;
  pageExtensions: string[];
  trailingSlash?: boolean;
  skipTrailingSlashRedirect?: boolean;
  caseSensitiveRoutes?: boolean;
  edgeRuntimeFiles?: string[];
}

// Next loads env files, installs require hooks, and caches CJS and ESM configs.
// A fresh process isolates those effects and reloads transitive config imports.
const loader = `
  const { createRequire } = require('module');
  const { join } = require('path');
  const projectRequire = createRequire(join(process.cwd(), 'package.json'));
  async function load(files) {
    const nextRequire = createRequire(projectRequire.resolve('next/package.json'));
    const { PHASE_DEVELOPMENT_SERVER } = nextRequire('next/constants');
    const { default: loadConfig } = nextRequire('next/dist/server/config');
    // Older Next versions interpret a third argument as a custom config override.
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, process.cwd());
    const result = {
      basePath: config.basePath,
      pageExtensions: config.pageExtensions,
      trailingSlash: config.trailingSlash === true,
      skipTrailingSlashRedirect: config.skipTrailingSlashRedirect === true,
      caseSensitiveRoutes: config.experimental?.caseSensitiveRoutes === true,
    };
    if (files.length) {
      result.edgeRuntimeFiles = [];
      const extensions = [...config.pageExtensions].sort((a, b) => b.length - a.length);
      for (const file of files) {
        const extension = extensions.find(ext => file.endsWith('.' + ext));
        if (!extension) continue;
        const entry = file.slice(0, -extension.length - 1).replace(/^src\\//, '');
        if (!/^(app\\/(.*\\/)?route|pages\\/api(\\/.*)?)$/.test(entry)) continue;
        if (entry.includes('[') || entry.split('/').some(part => part.startsWith('@') || (entry.startsWith('app/') && part.startsWith('_')) || /^\\(\\.{1,3}\\)/.test(part))) continue;
        const router = entry.split('/')[0];
        if (file.startsWith('src/') && files.some(candidate => candidate.startsWith(router + '/'))) continue;
        // Next's static analysis reads exports without executing the handler.
        const { getPageStaticInfo } = nextRequire('next/dist/build/analysis/get-page-static-info');
        const { runtime } = await getPageStaticInfo({
          pageFilePath: join(process.cwd(), file),
          nextConfig: config,
          isDev: true,
          page: '/' + entry.split('/').slice(1).join('/'),
          pageType: entry.startsWith('app/') ? 'app' : 'pages',
        });
        if (runtime === 'edge' || runtime === 'experimental-edge') result.edgeRuntimeFiles.push(file);
      }
    }
    process.send(result);
  }
  process.once('message', files => load(files).catch(() => process.exit(1)));
`;

export function loadNextDevRoutingConfig(
  cwd: string,
  env: NodeJS.ProcessEnv,
  files: string[] = []
): Promise<NextDevRoutingConfig> {
  return new Promise((resolve, reject) => {
    const fail = () =>
      reject(
        new NowBuildError({
          code: 'NEXT_DEV_MANIFEST_CONFIG',
          message: `Could not load Next.js development configuration in "${cwd}" for manifest discovery. Ensure Node.js and the project's Next.js dependency are installed, and that next dev can load next.config.* and statically analyze route runtime exports with the development environment. Configuration and route metadata must resolve within 10 seconds and return a string basePath and non-empty pageExtensions.`,
        })
      );
    let child;
    try {
      child = spawn(
        getNodeExecPath(),
        ['--input-type=commonjs', '-e', loader],
        {
          cwd,
          env: { ...env, NODE_ENV: env.NODE_ENV ?? 'development' },
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          windowsHide: true,
        }
      );
    } catch {
      fail();
      return;
    }
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      fail();
    }, 10_000);
    child.once('error', () => {
      clearTimeout(timeout);
      fail();
    });
    child.once('exit', () => {
      clearTimeout(timeout);
      fail();
    });
    child.once('message', (config: unknown) => {
      clearTimeout(timeout);
      child.kill('SIGKILL');
      if (
        !config ||
        typeof config !== 'object' ||
        !('basePath' in config) ||
        typeof config.basePath !== 'string' ||
        !('pageExtensions' in config) ||
        !Array.isArray(config.pageExtensions) ||
        !config.pageExtensions.length ||
        !config.pageExtensions.every(
          ext => typeof ext === 'string' && ext.length > 0
        ) ||
        ('edgeRuntimeFiles' in config &&
          (!Array.isArray(config.edgeRuntimeFiles) ||
            !config.edgeRuntimeFiles.every(file => typeof file === 'string')))
      ) {
        fail();
        return;
      }
      resolve({
        basePath: config.basePath,
        pageExtensions: config.pageExtensions,
        trailingSlash:
          'trailingSlash' in config && config.trailingSlash === true,
        skipTrailingSlashRedirect:
          'skipTrailingSlashRedirect' in config &&
          config.skipTrailingSlashRedirect === true,
        caseSensitiveRoutes:
          'caseSensitiveRoutes' in config &&
          config.caseSensitiveRoutes === true,
        ...('edgeRuntimeFiles' in config
          ? { edgeRuntimeFiles: config.edgeRuntimeFiles as string[] }
          : {}),
      });
    });
    child.send(files, error => {
      if (error) {
        clearTimeout(timeout);
        child.kill('SIGKILL');
        fail();
      }
    });
  });
}
