import { readFile } from 'fs/promises';
import { join } from 'path';

const frameworks = ['express', 'hono'];

const entrypointFilenames = ['app', 'index', 'server'];

const entrypointExtensions = ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'];

const entrypoints = entrypointFilenames.flatMap(filename =>
  entrypointExtensions.map(extension => `${filename}.${extension}`)
);

const createFrameworkRegex = (framework: string) =>
  new RegExp(
    `(?:from|require|import)\\s*(?:\\(\\s*)?["']${framework}["']\\s*(?:\\))?`,
    'g'
  );

export const findEntrypoint = async (cwd: string) => {
  const packageJson = await readFile(join(cwd, 'package.json'), 'utf-8');
  const packageJsonObject = JSON.parse(packageJson);
  const framework = frameworks.find(
    framework => packageJsonObject.dependencies?.[framework]
  );

  if (!framework) {
    throw new Error('No framework found in package.json');
  }

  const regex = createFrameworkRegex(framework);

  for (const entrypoint of entrypoints) {
    const entrypointPath = join(cwd, entrypoint);
    try {
      const content = await readFile(entrypointPath, 'utf-8');
      if (regex.test(content)) {
        return entrypoint;
      }
    } catch (e) {
      continue;
    }
  }
  for (const entrypoint of entrypoints) {
    const entrypointPath = join(cwd, 'src', entrypoint);
    try {
      const content = await readFile(entrypointPath, 'utf-8');
      if (regex.test(content)) {
        return join('src', entrypoint);
      }
    } catch (e) {
      continue;
    }
  }
  throw new Error('No entrypoint found');
};
