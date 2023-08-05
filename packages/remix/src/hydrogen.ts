import { basename } from 'path';
import { Node, Project } from 'ts-morph';

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
  const defaultExportSymbol = sourceFile.getDefaultExportSymbol();
  const envProperties: string[] = [];

  if (!defaultExportSymbol) {
    console.log(
      `WARN: No default export found in "${basename(serverEntryPoint)}"`
    );
    return;
  }

  const declaration = defaultExportSymbol.getDeclarations()[0];
  if (!Node.isExportAssignment(declaration)) {
    console.log(
      `WARN: No default export found in "${basename(serverEntryPoint)}"`
    );
    return;
  }

  const objectLiteral = declaration.getExpression();
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
  declaration.replaceWithText(newFunction);

  const envCode = `const env = { ${envProperties
    .map(name => `${name}: process.env.${name}`)
    .join(', ')} };`;

  const updatedCodeString = sourceFile.getFullText();
  return `${envCode}\n${updatedCodeString}`;
}
