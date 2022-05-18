#!/usr/bin/env node
import mri from 'mri';
import { resolve } from 'pathe';
import { a as createNitro, f as createDevServer, p as prepare, b as build, c as copyPublicAssets, h as prerender } from './chunks/prerender.mjs';
import 'worker_threads';
import 'fs';
import 'perfect-debounce';
import 'h3';
import 'http-proxy';
import 'listhen';
import 'serve-placeholder';
import 'serve-static';
import 'ufo';
import 'chokidar';
import 'url';
import 'chalk';
import 'hookable';
import 'unimport';
import 'consola';
import 'c12';
import 'klona/full';
import 'scule';
import 'defu';
import 'std-env';
import 'mlly';
import 'module';
import 'fs-extra';
import 'jiti';
import 'dot-prop';
import 'archiver';
import 'globby';
import 'pkg-types';
import 'unstorage';
import 'rollup';
import 'pretty-bytes';
import 'gzip-size';
import 'rollup-plugin-terser';
import '@rollup/plugin-commonjs';
import '@rollup/plugin-node-resolve';
import '@rollup/plugin-alias';
import '@rollup/plugin-json';
import '@rollup/plugin-wasm';
import '@rollup/plugin-inject';
import 'rollup-plugin-visualizer';
import 'unenv';
import 'unimport/unplugin';
import 'ohash';
import '@rollup/plugin-replace';
import '@vercel/nft';
import 'semver';
import 'etag';
import 'mime';
import 'table';
import 'is-primitive';
import 'esbuild';
import '@rollup/pluginutils';

async function main() {
  const args = mri(process.argv.slice(2));
  const command = args._[0];
  const rootDir = resolve(args._[1] || ".");
  if (command === "dev") {
    const nitro = await createNitro({
      rootDir,
      dev: true,
      preset: "nitro-dev"
    });
    const server = createDevServer(nitro);
    await server.listen({});
    await prepare(nitro);
    await build(nitro);
    return;
  }
  if (command === "build") {
    const nitro = await createNitro({
      rootDir,
      dev: false
    });
    await prepare(nitro);
    await copyPublicAssets(nitro);
    await prerender(nitro);
    await build(nitro);
    await nitro.close();
    process.exit(0);
  }
  console.error(`Unknown command ${command}! Usage: nitro dev|build [rootDir]`);
  process.exit(1);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
