import {
  Files,
  FileFsRef,
  type BuildV3,
  glob,
  BuildResultV3,
  FileBlob,
  Lambda,
} from '@vercel/build-utils';
import { join, sep } from 'path';
import { outputFile } from 'fs-extra';
import { spawn } from 'child_process';
import { relative, dirname } from 'path';
import { existsSync, readFileSync } from 'fs';
import { rm, symlink } from 'fs/promises';
import { mkdirp } from 'fs-extra';
import { nodeFileTrace } from '@vercel/nft';
import { createRequire } from 'module';
import { parse, pathToRegexp, Token } from 'path-to-regexp';

const require_ = createRequire(__filename);

export const introspectApp = async (
  args: Parameters<BuildV3>[0],
  res: BuildResultV3
) => {
  const { workPath, meta, config } = args;
  const baseDir = args.repoRootPath || workPath;
  const output = res.output as Lambda;

  const preparedFiles: Files = {};

  let handler = '';

  if (res.output && 'handler' in res.output) {
    handler = res.output.handler;
  }

  if (!handler) {
    throw new Error('Handler not found');
  }

  const outputPath = join(
    workPath,
    '.vercel',
    'output',
    'functions',
    'index.func',
    handler
  );

  const expressPath = join(
    workPath,
    '.vercel',
    'output',
    'functions',
    'index.func',
    'node_modules',
    'express',
    'index.js'
  );
  await outputFile(
    expressPath,
    `'use strict';

const fs = require('fs');
const path = require('path');

const mod = require('../../../../../../node_modules/express/lib/express');

const routesFile = path.join(__dirname, '..', '..', 'routes.json');
const routes = {};

const staticPaths = {}
const originalStatic = mod.static

mod.static = (...args) => {
  staticPaths[args[0]] = args[1] || true
  return originalStatic(...args)
}

let app = null;
const func2 = (...args) => {
  app = mod(...args);

  return app;
}
let views = ''
let viewEngine = ''

// Copy all properties from the original module to preserve functionality
Object.setPrototypeOf(func2, mod);
Object.assign(func2, mod);

const extractRoutes = () => {
  const methods = ["all", "get", "post", "put", "delete", "patch", "options", "head"]
  for (const route of app.router.stack) {
    if(route.route) {
      const m = [];
      for (const method of methods) {
        if(route.route.methods[method]) {
          m.push(method.toUpperCase());
        }
      }
      routes[route.route.path] = { methods: m };
    }
  }
  console.log(app.settings)
  views = app.settings.views
  viewEngine = app.settings['view engine']
  fs.writeFileSync(routesFile, JSON.stringify({routes, views, staticPaths, viewEngine}, null, 2));
}

process.on('exit', () => {
  extractRoutes()
});

process.on('SIGINT', () => {
  extractRoutes()
  process.exit(0);
});
// Write routes to file on SIGTERM
process.on('SIGTERM', () => {
  extractRoutes()
  process.exit(0);
});

module.exports = func2

  `
  );

  // Capture routes using child process
  await new Promise(resolve => {
    const child = spawn('node', [outputPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: workPath,
      env: { ...process.env, ...(meta?.env || {}), ...(meta?.buildEnv || {}) },
    });

    child.stderr.on('data', data => {
      console.error(`stderr: ${data}`);
    });

    // Kill after 2 seconds
    setTimeout(() => {
      child.kill('SIGTERM');
    }, 1000);

    // Wait for child to complete
    child.on('close', () => {
      resolve(undefined);
    });
  });

  // Process includeFiles if specified
  if (config.includeFiles) {
    const includeFiles =
      typeof config.includeFiles === 'string'
        ? [config.includeFiles]
        : config.includeFiles;

    for (const pattern of includeFiles) {
      const files = await glob(pattern, workPath);
      await Promise.all(
        Object.values(files).map(async entry => {
          const { fsPath } = entry;
          const relPath = relative(baseDir, fsPath);
          preparedFiles[relPath] = entry;
          console.log('Added includeFile to preparedFiles:', relPath);
        })
      );
    }
  }
  const routesFilePath = join(
    workPath,
    '.vercel',
    'output',
    'functions',
    'index.func',
    'routes.json'
  );
  const routesFile = readFileSync(routesFilePath, 'utf8');
  await rm(routesFilePath);
  await rm(
    join(
      workPath,
      '.vercel',
      'output',
      'functions',
      'index.func',
      'node_modules'
    ),
    { recursive: true, force: true }
  );

  const convertExpressRoute = (
    route: string,
    routeData: { methods: string[] }
  ) => {
    const { regexp } = pathToRegexp(route);
    const { tokens } = parse(route);

    const processTokens = (tokens: Token[]): string => {
      return tokens
        .map(t => {
          if (t.type === 'text') {
            return t.value;
          }
          if (t.type === 'param') {
            return `[${t.name}]`;
          }
          if (t.type === 'wildcard') {
            return `[...${t.name}]`;
          }
          if (t.type === 'group') {
            return processTokens(t.tokens);
          }
          return '';
        })
        .join('');
    };

    // Convert Express params (:id) to Vercel params ([id])
    const dest = processTokens(tokens);
    if (dest === '/') {
      return;
    }

    // Convert Express params to regex for src
    const src = regexp.toString();

    return {
      src,
      dest: dest,
      methods: routeData.methods,
    };
  };

  const data = JSON.parse(routesFile || '{}');
  if (data.views) {
    const viewsPath = relative(workPath, data.views);
    const views = await glob(`${viewsPath}/**/*`, workPath);
    for (const file of Object.keys(views)) {
      preparedFiles[file] = new FileBlob({
        data: readFileSync(file),
        mode: 0o644,
      });
    }
  }
  if (data.viewEngine) {
    const viewEngineDep = require_.resolve(data.viewEngine, {
      paths: [workPath],
    });
    const { fileList } = await nodeFileTrace([viewEngineDep], {
      base: workPath,
      processCwd: workPath,
      ts: true,
      mixedModules: true,
      ignore: config.excludeFiles,
    });
    for (const file of fileList) {
      preparedFiles[file] = new FileFsRef({ fsPath: file, mode: 0o644 });
    }
  }
  /**
   * TODO: for static paths declared without any options
   * we can put them on the CDN instead of including them
   * here. But for now, just include them
   */
  if (data.staticPaths) {
    const staticPaths = data.staticPaths;

    for (const path of Object.keys(staticPaths)) {
      if (path !== 'public') {
        const files = await glob(`${path}/**/*`, workPath);
        for (const file of Object.keys(files)) {
          preparedFiles[file] = new FileBlob({
            data: readFileSync(file),
            mode: 0o644,
          });
        }
      }
    }
  }
  const routesData = data.routes;
  const routePaths = Object.keys(routesData);
  const proxyRoutes = routePaths
    .map(route => convertExpressRoute(route, routesData[route]))
    .filter(Boolean) as { src: string; dest: string; methods: string[] }[];
  if (proxyRoutes.length > 0) {
    res.routes = [
      {
        handle: 'filesystem',
      },
    ];
    for (const route of proxyRoutes) {
      res.routes.push(route);
      // create symlink to index.func with fs-extra
      // if the dest path has a parent, create the parent directory
      const destPath = join(
        workPath,
        '.vercel',
        'output',
        'functions',
        `${route.dest}.func`
      );
      const destPathParent = join(
        workPath,
        '.vercel',
        'output',
        'functions',
        route.dest.split(sep).slice(0, -1).join(sep)
      );
      if (route.dest.split(sep).length > 2) {
        await mkdirp(destPathParent);
      }
      if (existsSync(destPath)) {
        await rm(destPath);
      }

      // Create relative path symlink
      const targetPath = join(
        workPath,
        '.vercel',
        'output',
        'functions',
        'index.func'
      );
      const relativeTargetPath = relative(dirname(destPath), targetPath);

      await symlink(relativeTargetPath, destPath);
    }
    res.routes.push({
      src: '/(.*)',
      dest: '/',
    });
  }

  const mergedFiles = { ...(output.files || {}), ...preparedFiles };
  res.output.files = mergedFiles;
};
