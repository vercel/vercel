import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { CommandEndpoint, HttpMethod } from '../../commands/help';
import { HTTP_METHODS } from './policy';

export interface ExtractedFetch {
  readonly method: HttpMethod;
  readonly path: string;
  readonly file: string;
  readonly line: number;
}

/**
 * Extracts resolvable `client.fetch(...)` (and `*.fetch(...)`) call sites
 * from a TypeScript source file. Template-literal interpolations become `{}`
 * path segments so they can be compared with declared `:param` / `{param}`
 * endpoints via `normalizeEndpoint`.
 *
 * Local `const base = '/v1/...'` bindings are resolved when used as
 * template interpolations or `+` concatenation (`${base}/token`).
 *
 * Unresolvable paths (non-local variables, complex expressions, etc.) are
 * skipped — those cannot be verified statically by the CI policy check.
 */
export function extractFetchesFromSource(
  fileName: string,
  sourceText: string
): ExtractedFetch[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const out: ExtractedFetch[] = [];
  const localPaths = collectLocalPathBindings(sourceFile);

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      if (node.expression.name.text === 'fetch' && node.arguments.length > 0) {
        const pathArg = node.arguments[0];
        const optsArg = node.arguments[1];
        const extractedPath = extractPathExpression(pathArg, localPaths);
        if (extractedPath) {
          const method = extractMethod(optsArg) ?? 'GET';
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile)
          );
          out.push({
            method,
            path: extractedPath,
            file: fileName,
            line: line + 1,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return out;
}

export function extractFetchesFromFile(filePath: string): ExtractedFetch[] {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  return extractFetchesFromSource(filePath, sourceText);
}

function extractPathExpression(
  node: ts.Expression,
  localPaths: ReadonlyMap<string, string>
): string | null {
  if (ts.isIdentifier(node)) {
    return localPaths.get(node.text) ?? null;
  }

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text.startsWith('/') ? node.text : null;
  }

  if (ts.isTemplateExpression(node)) {
    let path = node.head.text;
    for (const span of node.templateSpans) {
      const resolved = resolveInterpolation(span.expression, localPaths);
      if (resolved !== null) {
        path += resolved;
      } else if (path.endsWith('/')) {
        // Path-segment interpolations look like `.../${id}` / `.../${id}/...`.
        path += '{}';
      }
      // Suffix interpolations (`...${query}`, optional `?${...}`) are ignored
      // so they do not produce a bogus trailing `{}` segment.
      path += span.literal.text;
    }
    return path.startsWith('/') ? path : null;
  }

  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = extractPathExpression(node.left, localPaths);
    const right = extractPathExpression(node.right, localPaths);
    if (left && right) {
      return left + right;
    }
    return null;
  }

  return null;
}

/**
 * Resolves a template interpolation to a path fragment when possible.
 * Local path bindings are substituted in full; everything else that sits
 * on a `/`-terminated prefix becomes `{}`.
 */
function resolveInterpolation(
  expression: ts.Expression,
  localPaths: ReadonlyMap<string, string>
): string | null {
  if (ts.isIdentifier(expression)) {
    return localPaths.get(expression.text) ?? null;
  }
  // Parenthesized identifiers: `${(base)}/token`
  if (ts.isParenthesizedExpression(expression)) {
    return resolveInterpolation(expression.expression, localPaths);
  }
  return null;
}

/**
 * Maps simple `const url = '/...'` / template / `${base}/…` bindings in a
 * file so `client.fetch(url)` and `` client.fetch(`${base}/token`) `` call
 * sites can be attributed.
 */
function collectLocalPathBindings(
  sourceFile: ts.SourceFile
): Map<string, string> {
  const declarations: Array<{
    name: string;
    initializer: ts.Expression;
  }> = [];

  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.initializer) {
        declarations.push({
          name: node.name.text,
          initializer: node.initializer,
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  // Multi-pass so `const url = \`${base}/token\`` can resolve after `base`.
  const bindings = new Map<string, string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const { name, initializer } of declarations) {
      if (bindings.has(name)) {
        continue;
      }
      const path = extractPathExpression(initializer, bindings);
      if (path) {
        bindings.set(name, path);
        changed = true;
      }
    }
  }

  return bindings;
}

function extractMethod(node: ts.Expression | undefined): HttpMethod | null {
  if (!node || !ts.isObjectLiteralExpression(node)) {
    return null;
  }
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      continue;
    }
    const name = prop.name;
    const key = ts.isIdentifier(name)
      ? name.text
      : ts.isStringLiteral(name)
        ? name.text
        : null;
    if (key !== 'method') {
      continue;
    }
    const value = prop.initializer;
    if (
      ts.isStringLiteral(value) ||
      ts.isNoSubstitutionTemplateLiteral(value)
    ) {
      const method = value.text.toUpperCase();
      if ((HTTP_METHODS as ReadonlyArray<string>).includes(method)) {
        return method as HttpMethod;
      }
    }
  }
  return null;
}

/**
 * Collects relative import specifiers from a TypeScript source file.
 */
export function collectRelativeImports(
  fileName: string,
  sourceText: string
): string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const imports: string[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && statement.moduleSpecifier) {
      if (ts.isStringLiteral(statement.moduleSpecifier)) {
        const spec = statement.moduleSpecifier.text;
        if (spec.startsWith('.')) {
          imports.push(spec);
        }
      }
    }
  }

  return imports;
}

export function resolveImportToFile(
  fromFile: string,
  specifier: string
): string | null {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

export function toCommandEndpoint(fetch: ExtractedFetch): CommandEndpoint {
  return { method: fetch.method, path: fetch.path };
}
