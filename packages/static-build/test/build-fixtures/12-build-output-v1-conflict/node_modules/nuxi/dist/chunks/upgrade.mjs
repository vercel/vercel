import { execSync } from 'node:child_process';
import { promises, existsSync } from 'node:fs';
import { c as consola } from './consola.mjs';
import { r as resolve } from './index3.mjs';
import { r as resolveModule } from './cjs.mjs';
import { g as getPackageManager, p as packageManagerLocks } from './packageManagers.mjs';
import { d as defineNuxtCommand } from './index.mjs';
import './_commonjsHelpers.mjs';
import 'util';
import 'path';
import 'fs';
import 'os';
import 'tty';
import 'node:module';
import 'node:url';
import './fs.mjs';

async function getNuxtVersion(paths) {
  const pkgJson = resolveModule("nuxt/package.json", paths);
  const pkg = pkgJson && JSON.parse(await promises.readFile(pkgJson, "utf8"));
  if (!pkg.version) {
    consola.warn("Cannot find any installed nuxt versions in ", paths);
  }
  return pkg.version || "0.0.0";
}
const upgrade = defineNuxtCommand({
  meta: {
    name: "upgrade",
    usage: "npx nuxi upgrade [--force|-f]",
    description: "Upgrade nuxt"
  },
  async invoke(args) {
    const rootDir = resolve(args._[0] || ".");
    const packageManager = getPackageManager(rootDir);
    if (!packageManager) {
      console.error("Cannot detect Package Manager in", rootDir);
      process.exit(1);
    }
    const packageManagerVersion = execSync(`${packageManager} --version`).toString("utf8").trim();
    consola.info("Package Manager:", packageManager, packageManagerVersion);
    const currentVersion = await getNuxtVersion(rootDir);
    consola.info("Current nuxt version:", currentVersion);
    if (args.force || args.f) {
      consola.info("Removing lock-file and node_modules...");
      await Promise.all([
        promises.rm(packageManagerLocks[packageManager]),
        promises.rm("node_modules", { recursive: true })
      ]);
      execSync(`${packageManager} install`, { stdio: "inherit" });
    } else {
      consola.info("Upgrading nuxt...");
      await Promise.all(["node_modules/.cache", resolve(rootDir, ".nuxt"), "node_modules/.vite"].map((path) => {
        return existsSync(path) ? promises.rm(path, { recursive: true }) : void 0;
      }));
      execSync(`${packageManager} ${packageManager === "yarn" ? "add" : "install"} -D nuxt@rc`, { stdio: "inherit" });
    }
    const upgradedVersion = await getNuxtVersion(rootDir);
    consola.info("Upgraded nuxt version:", upgradedVersion);
    if (upgradedVersion === currentVersion) {
      consola.success("You're already using the latest version of nuxt.");
    } else {
      consola.success("Successfully upgraded nuxt from", currentVersion, "to", upgradedVersion);
      const commitA = currentVersion.split(".").pop();
      const commitB = upgradedVersion.split(".").pop();
      if (commitA && commitB) {
        consola.info("Changelog:", `https://github.com/nuxt/framework/compare/${commitA}...${commitB}`);
      }
    }
  }
});

export { upgrade as default };
