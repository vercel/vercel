import { m as mri, c as commands } from './chunks/index.mjs';
import { r as red } from './chunks/index2.mjs';
import { c as consola } from './chunks/consola.mjs';
import { e as engines, s as showBanner } from './chunks/banner.mjs';
import { s as showHelp } from './chunks/help.mjs';
import 'tty';
import './chunks/_commonjsHelpers.mjs';
import 'util';
import 'path';
import 'fs';
import 'os';
import 'assert';

async function checkEngines() {
  const satisfies = await import('./chunks/satisfies.mjs').then(function (n) { return n.s; }).then((r) => r.default || r);
  const currentNode = process.versions.node;
  const nodeRange = engines.node;
  if (!satisfies(currentNode, nodeRange)) {
    console.warn(`Current version of Node.js (\`${currentNode}\`) is unsupported and might cause issues.
       Please upgrade to a compatible version (${nodeRange}).`);
  }
}

async function _main() {
  const _argv = process.argv.slice(2);
  const args = mri(_argv, {
    boolean: [
      "no-clear"
    ]
  });
  const command = args._.shift() || "usage";
  showBanner(command === "dev" && args.clear !== false && !args.help);
  if (!(command in commands)) {
    console.log("\n" + red("Invalid command " + command));
    await commands.usage().then((r) => r.invoke());
    process.exit(1);
  }
  setTimeout(() => {
    checkEngines().catch(() => {
    });
  }, 1e3);
  const cmd = await commands[command]();
  if (args.h || args.help) {
    showHelp(cmd.meta);
  } else {
    const result = await cmd.invoke(args);
    return result;
  }
}
consola.wrapConsole();
process.on("unhandledRejection", (err) => consola.error("[unhandledRejection]", err));
process.on("uncaughtException", (err) => consola.error("[uncaughtException]", err));
function main() {
  _main().then((result) => {
    if (result === "error") {
      process.exit(1);
    } else if (result !== "wait") {
      process.exit(0);
    }
  }).catch((error) => {
    consola.error(error);
    process.exit(1);
  });
}

export { main };
