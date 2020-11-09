import { constants, PathLike, promises as fs } from 'fs';
import { FileBlob, Files, Lambda, PackageJson } from '@vercel/build-utils';
import { makeNowLauncher } from '../launcher';
import buildUtils from '../build-utils';
import path from 'path';

const { createLambda, debug, getLatestNodeVersion, glob } = buildUtils;

export type DeepWriteable<T> = {
  -readonly [P in keyof T]: DeepWriteable<T[P]>;
};

export async function fileExists(path: PathLike): Promise<boolean> {
  return fs.access(path, constants.F_OK).then(
    () => true,
    () => false
  );
}

/**
 * Read package.json from files
 */
export async function readPackageJson(entryPath: string): Promise<PackageJson> {
  const packagePath = path.join(entryPath, 'package.json');

  try {
    return JSON.parse(await fs.readFile(packagePath, 'utf8'));
  } catch (err) {
    return {};
  }
}

/**
 * Write package.json
 */
export async function writePackageJson(
  workPath: string,
  packageJson: PackageJson
) {
  await fs.writeFile(
    path.join(workPath, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
}

/**
 * Reads the .vercel_build_output directory and returns and object
 * that should be merged with the build outputs.
 *
 * At the moment only `functions/node` is supported.
 */
export async function readBuildOutputDirectory({
  workPath,
}: {
  workPath: string;
}) {
  const output: { [key: string]: Lambda } = {};
  const nodeFunctionPath = path.join(
    workPath,
    '.vercel_build_output',
    'functions',
    'node'
  );
  const nodeFunctionFiles = await glob('**/index.js', {
    cwd: nodeFunctionPath,
  });
  const nodeBridgeData = await fs.readFile(path.join(__dirname, 'bridge.js'));

  for (const fileName of Object.keys(nodeFunctionFiles)) {
    const launcherFileName = '___now_launcher';
    const bridgeFileName = '___now_bridge';

    const launcherFiles: Files = {
      [`${launcherFileName}.js`]: new FileBlob({
        data: makeNowLauncher({
          entrypointPath: `./index.js`,
          bridgePath: `./${bridgeFileName}`,
          helpersPath: '',
          sourcemapSupportPath: '',
          shouldAddHelpers: false,
          shouldAddSourcemapSupport: false,
          awsLambdaHandler: '',
        }),
      }),
      [`${bridgeFileName}.js`]: new FileBlob({
        data: nodeBridgeData,
      }),
    };

    const requiredFiles = await glob('**', {
      cwd: path.join(nodeFunctionPath, path.dirname(fileName)),
    });

    const lambda = await createLambda({
      files: {
        ...requiredFiles,
        ...launcherFiles,
      },
      handler: `${launcherFileName}.launcher`,
      runtime: getLatestNodeVersion().runtime,
    });

    const parsed = path.parse(fileName);
    const newPath = path.join(parsed.dir, parsed.name);
    output[newPath] = lambda;

    debug(
      `Created Lambda "${newPath}" from "${path.join(
        nodeFunctionPath,
        fileName
      )}".`
    );
  }

  return { output };
}
