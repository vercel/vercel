import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { r as resolve } from './index3.mjs';
import { f as findup } from './fs.mjs';

const packageManagerLocks = {
  yarn: "yarn.lock",
  npm: "package-lock.json",
  pnpm: "pnpm-lock.yaml"
};
function getPackageManager(rootDir) {
  return findup(rootDir, (dir) => {
    for (const name in packageManagerLocks) {
      if (existsSync(resolve(dir, packageManagerLocks[name]))) {
        return name;
      }
    }
  });
}
function getPackageManagerVersion(name) {
  return execSync(`${name} --version`).toString("utf8").trim();
}

export { getPackageManagerVersion as a, getPackageManager as g, packageManagerLocks as p };
