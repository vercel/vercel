import path from 'path';
import { constants, promises as fs } from 'fs';
import {
  Node,
  Project,
  SyntaxKind,
  type ArrayLiteralExpression,
  type ObjectLiteralExpression,
  type SourceFile,
} from 'ts-morph';
import { runNpmInstall, type Meta } from '@vercel/build-utils';

const NITRO_PACKAGE = 'nitro';
const NITRO_VITE_IMPORT = 'nitro/vite';
const VITE_CONFIG_FILES = [
  'vite.config.ts',
  'vite.config.mts',
  'vite.config.cts',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.cjs',
];

async function fileExists(filePath: string): Promise<boolean> {
  return fs.access(filePath, constants.F_OK).then(
    () => true,
    () => false
  );
}

async function findViteConfigPath(dir: string): Promise<string | undefined> {
  for (const file of VITE_CONFIG_FILES) {
    const configPath = path.join(dir, file);
    if (await fileExists(configPath)) {
      return configPath;
    }
  }

  return undefined;
}

function toImportPath(fromDir: string, toFile: string) {
  let importPath = path.relative(fromDir, toFile).split(path.sep).join('/');

  if (!importPath.startsWith('.')) {
    importPath = `./${importPath}`;
  }

  return importPath;
}

function quoteShellArg(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function isSimpleViteBuildCommand(command: string) {
  return /^\s*vite\s+build(?:\s|$)/.test(command) && !/[;&|]/.test(command);
}

function getObjectLiteralFromInitializer(
  node: Node
): ObjectLiteralExpression | undefined {
  if (Node.isObjectLiteralExpression(node)) {
    return node;
  }

  if (Node.isCallExpression(node)) {
    const [firstArg] = node.getArguments();
    if (firstArg && Node.isObjectLiteralExpression(firstArg)) {
      return firstArg;
    }
  }

  return undefined;
}

function getExportedConfigObject(
  sourceFile: SourceFile
): ObjectLiteralExpression | undefined {
  const exportAssignment = sourceFile
    .getExportAssignments()
    .find(assignment => !assignment.isExportEquals());

  if (!exportAssignment) {
    return;
  }

  const expression = exportAssignment.getExpression();
  const objectLiteral = getObjectLiteralFromInitializer(expression);
  if (objectLiteral) {
    return objectLiteral;
  }

  if (!Node.isIdentifier(expression)) {
    return;
  }

  const declaration = sourceFile.getVariableDeclaration(expression.getText());
  const initializer = declaration?.getInitializer();
  return initializer ? getObjectLiteralFromInitializer(initializer) : undefined;
}

function findViteConfigObject(
  sourceFile: SourceFile
): ObjectLiteralExpression | undefined {
  for (const callExpression of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression
  )) {
    if (callExpression.getExpression().getText() !== 'defineConfig') {
      continue;
    }

    const [firstArg] = callExpression.getArguments();
    if (firstArg && Node.isObjectLiteralExpression(firstArg)) {
      return firstArg;
    }
  }

  return getExportedConfigObject(sourceFile);
}

function hasNitroPlugin(plugins: ArrayLiteralExpression) {
  return plugins
    .getElements()
    .some(element => /\bnitro\s*\(/.test(element.getText()));
}

function configAlreadyUsesNitro(configPath: string) {
  const project = new Project();
  const sourceFile = project.addSourceFileAtPath(configPath);

  if (
    sourceFile
      .getImportDeclarations()
      .some(
        declaration =>
          declaration.getModuleSpecifierValue() === NITRO_VITE_IMPORT
      )
  ) {
    const configObject = findViteConfigObject(sourceFile);
    const pluginsProperty = configObject?.getProperty('plugins');
    if (pluginsProperty && Node.isPropertyAssignment(pluginsProperty)) {
      const initializer = pluginsProperty.getInitializer();
      return Boolean(
        initializer &&
          Node.isArrayLiteralExpression(initializer) &&
          hasNitroPlugin(initializer)
      );
    }
  }

  return false;
}

function canResolveNitro(projectDir: string) {
  try {
    require.resolve(NITRO_VITE_IMPORT, {
      paths: [projectDir],
    });
    return true;
  } catch (_err) {
    return false;
  }
}

async function ensureHelperNitroDependency(helperDir: string, meta: Meta) {
  await fs.mkdir(helperDir, { recursive: true });

  const packageJsonPath = path.join(helperDir, 'package.json');
  if (!(await fileExists(packageJsonPath))) {
    await fs.writeFile(
      packageJsonPath,
      `${JSON.stringify(
        {
          private: true,
          dependencies: {
            [NITRO_PACKAGE]: 'latest',
          },
        },
        null,
        2
      )}\n`
    );
  }

  console.log(
    `Installing "${NITRO_PACKAGE}" for TanStack Start build configuration`
  );
  await runNpmInstall(helperDir, [], { env: process.env }, meta);
}

async function writeWrapperConfig({
  helperDir,
  userConfigPath,
}: {
  helperDir: string;
  userConfigPath: string;
}) {
  await fs.mkdir(helperDir, { recursive: true });

  const wrapperConfigPath = path.join(helperDir, 'vite.config.mjs');
  const userConfigImportPath = toImportPath(helperDir, userConfigPath);
  const contents = `import { mergeConfig } from 'vite';
import { nitro } from 'nitro/vite';
import userConfig from '${userConfigImportPath}';

export default async function tanStackStartVercelConfig(configEnv) {
  const resolvedUserConfig =
    typeof userConfig === 'function' ? await userConfig(configEnv) : await userConfig;

  return mergeConfig(resolvedUserConfig, {
    plugins: [nitro()],
  });
}
`;

  await fs.writeFile(wrapperConfigPath, contents);
  return wrapperConfigPath;
}

export async function prepareTanStackStartBuildCommand({
  buildCommand,
  dir,
  meta,
  packageBuildScript,
}: {
  buildCommand: string | null;
  dir: string;
  meta: Meta;
  packageBuildScript?: string;
}) {
  const userConfigPath = await findViteConfigPath(dir);
  if (!userConfigPath || configAlreadyUsesNitro(userConfigPath)) {
    return buildCommand;
  }

  const helperDir = path.join(dir, '.vercel', 'tanstack-start');
  const wrapperConfigPath = await writeWrapperConfig({
    helperDir,
    userConfigPath,
  });

  if (!canResolveNitro(dir)) {
    await ensureHelperNitroDependency(helperDir, meta);
  }

  const relativeWrapperConfigPath = toImportPath(dir, wrapperConfigPath);
  const baseBuildCommand =
    buildCommand ||
    (packageBuildScript && isSimpleViteBuildCommand(packageBuildScript)
      ? packageBuildScript
      : 'vite build');
  const command = `${baseBuildCommand} --config ${quoteShellArg(
    relativeWrapperConfigPath
  )}`;

  console.log(
    `Using generated TanStack Start Vite config \`${wrapperConfigPath}\``
  );

  return command;
}
