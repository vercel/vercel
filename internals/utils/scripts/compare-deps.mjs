import path from "path";
import fs from "fs";

const cliPkgPath = path.resolve('./../../packages/cli/package.json');
const cliPkg = JSON.parse(fs.readFileSync(cliPkgPath, 'utf-8'));
const utilsPkgPath = path.resolve('./package.json');
const utilsPkg = JSON.parse(fs.readFileSync(utilsPkgPath, 'utf-8'));

const diffs = [];

const cliDeps = new Map([...Object.entries(cliPkg.dependencies), ...Object.entries(cliPkg.devDependencies)])
const utilsDeps = new Map([/*...Object.entries(utilsPkg.dependencies),*/ ...Object.entries(utilsPkg.devDependencies)])

for (const [depName, depVersion] of utilsDeps) {
  if (cliDeps.has(depName) && depVersion !== cliDeps.get(depName)) {
    diffs.push(`${depName}@${cliDeps.get(depName)}`)
  }
}

console.log(`pnpm add ${diffs.join(' ')}`);
