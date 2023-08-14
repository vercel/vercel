import { basename } from 'path';
import { Node, Project, SyntaxKind } from 'ts-morph';

/**
 * For Hydrogen v2, the `server.ts` file exports a signature like:
 *
 * ```
 * export default {
 *   async fetch(
 *     request: Request,
 *     env: Env,
 *     executionContext: ExecutionContext,
 *   ): Promise<Response>;
 * }
 * ```
 *
 * Here we parse the AST of that file so that we can:
 *
 *  1. Convert the signature to be compatible with Vercel Edge functions
 *     (i.e. `export default (res: Response): Promise<Response>`).
 *
 *  2. Track usages of the `env` parameter which (which gets removed),
 *     so that we can create that object based on `process.env`.
 */
export function patchHydrogenServer(
  project: Project,
  serverEntryPoint: string
) {
  const sourceFile = project.addSourceFileAtPath(serverEntryPoint);
  const defaultExportSymbol = sourceFile.getDescendantsOfKind(
    SyntaxKind.ExportAssignment
  )[0];
  const envProperties: string[] = [];

  if (!defaultExportSymbol) {
    console.log(
      `WARN: No default export found in "${basename(serverEntryPoint)}"`
    );
    return;
  }

  const objectLiteral = defaultExportSymbol.getFirstChildByKind(
    SyntaxKind.ObjectLiteralExpression
  );
  if (!Node.isObjectLiteralExpression(objectLiteral)) {
    console.log(
      `WARN: Default export in "${basename(
        serverEntryPoint
      )}" does not conform to Oxygen syntax`
    );
    return;
  }

  const fetchMethod = objectLiteral.getProperty('fetch');
  if (!fetchMethod || !Node.isMethodDeclaration(fetchMethod)) {
    console.log(
      `WARN: Default export in "${basename(
        serverEntryPoint
      )}" does not conform to Oxygen syntax`
    );
    return;
  }

  const parameters = fetchMethod.getParameters();

  // Find usages of the env object within the fetch method
  const envParam = parameters[1];
  const envParamName = envParam.getName();
  if (envParam) {
    fetchMethod.forEachDescendant(node => {
      if (
        Node.isPropertyAccessExpression(node) &&
        node.getExpression().getText() === envParamName
      ) {
        envProperties.push(node.getName());
      }
    });
  }

  // Vercel does not support the Web Cache API, so find
  // and replace `caches.open()` calls with `undefined`
  fetchMethod.forEachDescendant(node => {
    if (
      Node.isCallExpression(node) &&
      node.getExpression().getText() === 'caches.open'
    ) {
      node.replaceWithText(`undefined /* ${node.getText()} */`);
    }
  });

  // Remove the 'env' parameter to match Vercel's Edge signature
  parameters.splice(1, 1);

  // Construct the new function with the parameters and body of the original fetch method
  const newFunction = `export default async function(${parameters
    .map(p => p.getText())
    .join(', ')}) ${fetchMethod.getBody()!.getText()}`;
  defaultExportSymbol.replaceWithText(newFunction);

  const defaultEnvVars = {
    SESSION_SECRET: 'foobar',
    PUBLIC_STORE_DOMAIN: 'mock.shop',
  };
  const envCode = `const env = { ${envProperties
    .map(name => `${name}: process.env.${name}`)
    .join(', ')} };\n${Object.entries(defaultEnvVars)
    .map(
      ([k, v]) =>
        `if (!env.${k}) { env.${k} = ${JSON.stringify(
          v
        )}; console.warn('${JSON.stringify(
          k
        )} env var not set - using default value ${JSON.stringify(v)}'); }`
    )
    .join('\n')}`;

  const updatedCodeString = sourceFile.getFullText();
  return `${envCode}\n${updatedCodeString}`;
}
