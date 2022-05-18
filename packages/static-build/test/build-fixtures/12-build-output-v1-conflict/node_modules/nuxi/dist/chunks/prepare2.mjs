import { buildNuxt } from '@nuxt/kit';
import { r as resolve, a as relative } from './index3.mjs';
import { c as consola } from './consola.mjs';
import { c as clearDir } from './fs.mjs';
import { l as loadKit } from './kit.mjs';
import { w as writeTypes } from './prepare.mjs';
import { d as defineNuxtCommand } from './index.mjs';
import './_commonjsHelpers.mjs';
import 'util';
import 'path';
import 'fs';
import 'os';
import 'tty';
import 'node:fs';
import './cjs.mjs';
import 'node:module';
import 'node:url';

const prepare = defineNuxtCommand({
  meta: {
    name: "prepare",
    usage: "npx nuxi prepare",
    description: "Prepare nuxt for development/build"
  },
  async invoke(args) {
    process.env.NODE_ENV = process.env.NODE_ENV || "production";
    const rootDir = resolve(args._[0] || ".");
    const { loadNuxt } = await loadKit(rootDir);
    const nuxt = await loadNuxt({ rootDir, config: { _prepare: true } });
    await clearDir(nuxt.options.buildDir);
    await buildNuxt(nuxt);
    await writeTypes(nuxt);
    consola.success("Types generated in", relative(process.cwd(), nuxt.options.buildDir));
  }
});

export { prepare as default };
