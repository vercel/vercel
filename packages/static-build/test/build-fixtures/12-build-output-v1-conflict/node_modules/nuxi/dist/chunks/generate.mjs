import { c as consola } from './consola.mjs';
import buildCommand from './build.mjs';
import { d as defineNuxtCommand } from './index.mjs';
import './_commonjsHelpers.mjs';
import 'util';
import 'path';
import 'fs';
import 'os';
import 'tty';
import './index3.mjs';
import './prepare.mjs';
import 'node:fs';
import './cjs.mjs';
import 'node:module';
import 'node:url';
import './kit.mjs';
import './fs.mjs';

const generate = defineNuxtCommand({
  meta: {
    name: "generate",
    usage: "npx nuxi generate [rootDir]",
    description: "Build Nuxt and prerender static routes"
  },
  async invoke(args) {
    args.prerender = true;
    await buildCommand.invoke(args);
    consola.success("You can now deploy `.output/public` to any static hosting!");
  }
});

export { generate as default };
