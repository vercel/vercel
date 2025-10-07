import { join } from 'path';
import execa from 'execa';
import { readFileSync } from 'fs';
import { entrypointCallback } from './find-entrypoint';

const FRAMEWORK_REGEXES = {
  express: /(?:from|require|import)\s*(?:\(\s*)?["']express["']\s*(?:\))?/g,
  hono: /(?:from|require|import)\s*(?:\(\s*)?["']hono["']\s*(?:\))?/g,
};

export const serve = async (args: any) => {
  const frameworkRegex = await findFrameworkRegex(args.cwd);
  if (!frameworkRegex) {
    throw new Error('Framework not found in package.json');
  }
  const entrypoint = await entrypointCallback(args, frameworkRegex);
  const srvxPath = require.resolve('srvx');
  const srvxBin = join(srvxPath, '..', '..', '..', 'bin', 'srvx.mjs');
  const tsxBin = require.resolve('tsx');
  const srvxArgs = [srvxBin, '--import', tsxBin, entrypoint];
  await execa('npx', srvxArgs, {
    cwd: args.cwd,
    stdio: 'inherit',
  });
};

const findFrameworkRegex = async (cwd: string) => {
  const packageJson = await readPackageJson(cwd);
  const framework = Object.keys(FRAMEWORK_REGEXES).find(
    framework => packageJson.dependencies[framework]
  ) as keyof typeof FRAMEWORK_REGEXES | undefined;
  return framework ? FRAMEWORK_REGEXES[framework] : null;
};

const readPackageJson = async (cwd: string) => {
  const packageJsonPath = join(cwd, 'package.json');
  const packageJson = readFileSync(packageJsonPath, 'utf8');
  return JSON.parse(packageJson);
};
