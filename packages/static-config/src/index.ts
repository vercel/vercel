import { readFileSync } from 'node:fs';
import {
  ArrayLiteralExpression,
  Node,
  NodeFlags,
  ObjectLiteralExpression,
  Project,
  SourceFile,
  SyntaxKind,
} from 'ts-morph';
import { FromSchema, JSONSchema } from 'json-schema-to-ts';
import { loadOxcParser } from './load-oxc';
import { validate } from './validation';

export const BaseFunctionConfigSchema = {
  type: 'object',
  properties: {
    architecture: {
      type: 'string',
      enum: ['x86_64', 'arm64'],
    },
    runtime: { type: 'string' },
    memory: { type: 'number' },
    maxDuration: {
      oneOf: [{ type: 'number' }, { type: 'string', enum: ['max'] }],
    },
    supportsCancellation: {
      type: 'boolean',
    },
    regions: {
      oneOf: [
        {
          type: 'array',
          items: { type: 'string' },
        },
        {
          enum: ['all', 'default', 'auto'],
        },
      ],
    },
    preferredRegion: {
      oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    },
    useWebApi: {
      type: 'boolean',
    },
  },
} as const;

export type BaseFunctionConfig = FromSchema<typeof BaseFunctionConfigSchema>;

/** The subset of a build-utils Span used by static config extraction. */
export interface StaticConfigSpan {
  child(
    name: string,
    attrs?: Record<string, string | undefined>
  ): StaticConfigSpan;
  setAttributes(attrs: Record<string, string | undefined>): void;
  stop(): void;
}

/**
 * Reads `export const config = { ... }` from a JavaScript or TypeScript file.
 * Oxc is the fast path; ts-morph preserves compatibility if Oxc cannot extract
 * the configuration.
 */
// @ts-ignore TypeScript recursively compares the generic schema overload with
// the default schema overload until it reaches its instantiation depth limit.
export function getConfig(
  project: Project | null,
  sourcePath: string,
  schema?: undefined,
  span?: StaticConfigSpan
): BaseFunctionConfig | null;
export function getConfig<T extends JSONSchema>(
  project: Project | null,
  sourcePath: string,
  schema: T,
  span?: StaticConfigSpan
): FromSchema<T> | null;
export function getConfig(
  project: Project | null,
  sourcePath: string,
  schema?: JSONSchema,
  span?: StaticConfigSpan
): unknown | null {
  const extractionSpan = span?.child('vc.builder.static_config', {
    'static_config.parser': 'oxc',
  });

  try {
    try {
      const config: unknown = getConfigWithOxc(sourcePath, schema);
      extractionSpan?.setAttributes({
        'static_config.outcome': extractionOutcome(config),
      });
      return config;
    } catch (oxcError) {
      extractionSpan?.setAttributes({
        'static_config.fallback': 'true',
        'static_config.oxc_error': classifyOxcError(oxcError),
        'static_config.parser': 'ts-morph',
        ...oxcLoadSpanAttrs(oxcError),
      });

      try {
        const config: unknown = getConfigWithTsMorph(
          project || new Project(),
          sourcePath,
          schema
        );
        extractionSpan?.setAttributes({
          'static_config.outcome': extractionOutcome(config),
        });
        return config;
      } catch {
        if (isOxcParseError(oxcError)) {
          extractionSpan?.setAttributes({
            'static_config.outcome': 'not_found',
          });
          return null;
        }
        extractionSpan?.setAttributes({
          'static_config.outcome': 'error',
        });
        // Preserve the Oxc error because it describes why the happy path failed
        // and is generally more precise about unsupported syntax.
        throw oxcError;
      }
    }
  } finally {
    extractionSpan?.stop();
  }
}

function classifyOxcError(error: unknown): string {
  if (isOxcLoadError(error)) return 'load';
  if (isOxcParseError(error)) return 'parse';
  if (error instanceof Error && error.message.startsWith('Unhandled type:')) {
    return 'unsupported_node';
  }
  if (error instanceof Error && error.message === 'Invalid data') {
    return 'validation';
  }
  return 'unknown';
}

function oxcLoadSpanAttrs(error: unknown): Record<string, string | undefined> {
  if (!isOxcLoadError(error)) return {};
  const cause = error.cause;
  const attrs: Record<string, string | undefined> = {};
  if (
    cause &&
    typeof cause === 'object' &&
    'code' in cause &&
    typeof cause.code === 'string'
  ) {
    attrs['static_config.oxc_error_code'] = cause.code;
  }
  if (cause instanceof Error && cause.message) {
    attrs['static_config.oxc_error_message'] = cause.message.slice(0, 200);
  }
  return attrs;
}

function extractionOutcome(config: unknown): string {
  return config === null ? 'not_found' : 'found';
}

const OXC_PARSE_ERROR = 'Oxc could not parse static config';
const OXC_LOAD_ERROR = 'Oxc parser failed to load';

function isOxcParseError(error: unknown): boolean {
  return error instanceof Error && error.message === OXC_PARSE_ERROR;
}

type ErrorWithCause = Error & { cause?: unknown };

function isOxcLoadError(error: unknown): error is ErrorWithCause {
  return error instanceof Error && error.message === OXC_LOAD_ERROR;
}

function wrapOxcLoadError(error: unknown): ErrorWithCause {
  const loadError = new Error(OXC_LOAD_ERROR) as ErrorWithCause;
  loadError.cause = error;
  return loadError;
}

type OxcParseSync = typeof import('oxc-parser').parseSync;

let parseSync: OxcParseSync | undefined;

function getOxcParseSync(): OxcParseSync {
  if (!parseSync) {
    try {
      ({ parseSync } = loadOxcParser());
    } catch (error) {
      throw wrapOxcLoadError(error);
    }
  }
  return parseSync;
}

function getConfigWithOxc(
  sourcePath: string,
  schema?: JSONSchema
): unknown | null {
  const source = readFileSync(sourcePath, 'utf8');
  const parse = getOxcParseSync();
  const parsed = parse(sourcePath, source, { sourceType: 'unambiguous' });
  let statements = parsed.program.body as OxcStatement[];

  // Oxc may discard the whole program after a later syntax error. Preserve
  // config declarations that occur before that error, matching ts-morph's
  // tolerant parsing, while leaving unrelated diagnostics to the caller's
  // compiler or bundler.
  if (statements.length === 0 && parsed.errors.length > 0) {
    const recoveryOffsets = parsed.errors
      .flatMap(error => error.labels.map(label => label.start))
      .map(offset => source.lastIndexOf('\n', offset - 1) + 1)
      .filter(offset => offset > 0)
      .sort((a, b) => b - a);

    for (const offset of recoveryOffsets) {
      const recovered = parse(sourcePath, source.slice(0, offset), {
        sourceType: 'unambiguous',
      });
      if (recovered.errors.length === 0) {
        statements = recovered.program.body as OxcStatement[];
        break;
      }
    }
  }

  for (const statement of statements) {
    if (statement.type !== 'ExportNamedDeclaration') continue;
    const declaration = statement.declaration;
    if (declaration?.type !== 'VariableDeclaration') continue;
    if (declaration.kind !== 'const') continue;

    for (const declarator of declaration.declarations) {
      if (
        declarator.id.type === 'Identifier' &&
        declarator.id.name === 'config' &&
        declarator.init
      ) {
        const config = extractValue(declarator.init);
        // @ts-ignore The schema default is fixed, but TypeScript cannot connect
        // the conditional generic default to `schema || BaseFunctionConfigSchema`.
        return validate(schema || BaseFunctionConfigSchema, config);
      }
    }
  }

  if (parsed.errors.length > 0) {
    throw new Error(OXC_PARSE_ERROR);
  }
  return null;
}

type OxcStatement = {
  type: string;
  declaration?: OxcVariableDeclaration;
};

type OxcVariableDeclaration = {
  type: 'VariableDeclaration';
  kind: string;
  declarations: Array<{
    id: { type: string; name?: string };
    init?: OxcExpression | null;
  }>;
};

type OxcExpression = {
  type: string;
  value?: unknown;
  name?: string;
  elements?: Array<OxcExpression | null>;
  expression?: OxcExpression;
  properties?: Array<{
    type: string;
    computed?: boolean;
    key?: { type: string; name?: string; value?: unknown };
    value?: OxcExpression;
  }>;
};

function extractValue(node: OxcExpression): unknown {
  if (
    (node.type === 'TSAsExpression' ||
      node.type === 'TSSatisfiesExpression' ||
      node.type === 'TSNonNullExpression' ||
      node.type === 'TypeCastExpression') &&
    node.expression
  ) {
    return extractValue(node.expression);
  }
  if (node.type === 'Literal') return node.value;
  if (node.type === 'Identifier' && node.name === 'undefined') return undefined;
  if (node.type === 'ArrayExpression') {
    return (node.elements || []).map(element => {
      if (!element) return undefined;
      if (element.type === 'SpreadElement') throw unsupported(element);
      return extractValue(element);
    });
  }
  if (node.type === 'ObjectExpression') {
    const result: Record<string, unknown> = {};
    for (const property of node.properties || []) {
      if (
        property.type !== 'Property' ||
        property.computed ||
        !property.key ||
        !property.value
      ) {
        throw unsupported(node);
      }
      const key = propertyName(property.key);
      if (key === undefined) throw unsupported(property.key);
      result[key] = extractValue(property.value);
    }
    return result;
  }
  throw unsupported(node);
}

function propertyName(node: {
  type: string;
  name?: string;
  value?: unknown;
}): string | undefined {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return undefined;
}

function unsupported(node: OxcExpression) {
  return new Error(`Unhandled type: "${node.type}"`);
}

function getConfigWithTsMorph(
  project: Project,
  sourcePath: string,
  schema?: JSONSchema
): unknown | null {
  const sourceFile = project.addSourceFileAtPath(sourcePath);
  const configNode = getConfigNode(sourceFile);
  if (!configNode) return null;
  const config = getTsMorphValue(configNode);
  // @ts-ignore The schema default is fixed, but TypeScript cannot connect the
  // conditional generic default to `schema || BaseFunctionConfigSchema`.
  return validate(schema || BaseFunctionConfigSchema, config);
}

function getConfigNode(sourceFile: SourceFile) {
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)
    .find(objectLiteral => {
      const varDec = objectLiteral.getParentIfKind(
        SyntaxKind.VariableDeclaration
      );
      if (varDec?.getName() !== 'config') return false;

      const varDecList = varDec.getParentIfKind(
        SyntaxKind.VariableDeclarationList
      );
      const isConst = (varDecList?.getFlags() ?? 0) & NodeFlags.Const;
      if (!isConst) return false;

      const exp = varDecList?.getParentIfKind(SyntaxKind.VariableStatement);
      return Boolean(exp?.isExported());
    });
}

function getTsMorphValue(valueNode: Node): unknown {
  if (Node.isStringLiteral(valueNode)) {
    return eval(valueNode.getText());
  }
  if (Node.isNumericLiteral(valueNode)) return Number(valueNode.getText());
  if (Node.isTrueLiteral(valueNode)) return true;
  if (Node.isFalseLiteral(valueNode)) return false;
  if (Node.isNullLiteral(valueNode)) return null;
  if (Node.isArrayLiteralExpression(valueNode))
    return getTsMorphArray(valueNode);
  if (Node.isObjectLiteralExpression(valueNode)) {
    return getTsMorphObject(valueNode);
  }
  if (Node.isIdentifier(valueNode) && valueNode.getText() === 'undefined') {
    return undefined;
  }
  throw new Error(
    `Unhandled type: "${valueNode.getKindName()}" ${valueNode.getText()}`
  );
}

function getTsMorphObject(obj: ObjectLiteralExpression): unknown {
  const result: Record<string, unknown> = {};
  for (const prop of obj.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) continue;
    const [nameNode, _colon, valueNode] = prop.getChildren();
    result[nameNode.getText()] = getTsMorphValue(valueNode);
  }
  return result;
}

function getTsMorphArray(arr: ArrayLiteralExpression): unknown {
  const elementNodes = arr.getElements();
  const result = new Array(elementNodes.length);
  for (let i = 0; i < elementNodes.length; i++) {
    result[i] = getTsMorphValue(elementNodes[i]);
  }
  return result;
}
