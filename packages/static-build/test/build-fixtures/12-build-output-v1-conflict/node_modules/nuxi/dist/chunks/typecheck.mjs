import { e as execa } from './index5.mjs';
import { r as resolve } from './index3.mjs';
import { t as tryResolveModule } from './cjs.mjs';
import { l as loadKit } from './kit.mjs';
import { w as writeTypes } from './prepare.mjs';
import { d as defineNuxtCommand } from './index.mjs';
import 'node:buffer';
import 'node:path';
import 'node:child_process';
import 'node:process';
import 'child_process';
import 'path';
import './_commonjsHelpers.mjs';
import 'fs';
import 'node:url';
import 'os';
import 'node:os';
import 'assert';
import 'events';
import 'buffer';
import 'stream';
import 'util';
import 'node:module';
import 'node:fs';

const typecheck = defineNuxtCommand({
  meta: {
    name: "typecheck",
    usage: "npx nuxi typecheck [rootDir]",
    description: "Runs `vue-tsc` to check types throughout your app."
  },
  async invoke(args) {
    process.env.NODE_ENV = process.env.NODE_ENV || "production";
    const rootDir = resolve(args._[0] || ".");
    const { loadNuxt } = await loadKit(rootDir);
    const nuxt = await loadNuxt({ rootDir, config: { _prepare: true } });
    await writeTypes(nuxt);
    await nuxt.close();
    const hasLocalInstall = tryResolveModule("typescript", rootDir) && tryResolveModule("vue-tsc/package.json", rootDir);
    if (hasLocalInstall) {
      await execa("vue-tsc", ["--noEmit"], { preferLocal: true, stdio: "inherit", cwd: rootDir });
    } else {
      await execa("npx", "-p vue-tsc -p typescript vue-tsc --noEmit".split(" "), { stdio: "inherit", cwd: rootDir });
    }
  }
});

export { typecheck as default };
