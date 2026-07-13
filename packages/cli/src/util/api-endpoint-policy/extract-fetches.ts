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
 * Unresolvable paths (variables, concatenation, etc.) are skipped — those
 * still need to be declared manually and cannot be verified statically.
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

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      if (node.expression.name.text === 'fetch' && node.arguments.length > 0) {
        const pathArg = node.arguments[0];
        const optsArg = node.arguments[1];
        const extractedPath = extractPathExpression(pathArg);
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

function extractPathExpression(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text.startsWith('/') ? node.text : null;
  }

  if (ts.isTemplateExpression(node)) {
    let path = node.head.text;
    for (const span of node.templateSpans) {
      path += '{}';
      path += span.literal.text;
    }
    return path.startsWith('/') ? path : null;
  }

  return null;
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
