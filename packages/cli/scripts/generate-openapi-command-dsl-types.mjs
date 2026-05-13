import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const repoRoot = new URL('../', import.meta.url);
const openApiConstantsPath = new URL('src/util/openapi/constants.ts', repoRoot);
const generatedTypesPath = new URL(
  'src/util/openapi/generated-command-dsl-types.ts',
  repoRoot
);
const OPENAPI_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const FETCH_TIMEOUT_MS = 10_000;

function toTsStringLiteral(value) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function readOpenApiUrl() {
  const constantsSource = readFileSync(openApiConstantsPath, 'utf8');
  const match = constantsSource.match(
    /export const OPENAPI_URL = ['"](?<url>[^'"]+)['"]/
  );
  const openApiUrl = match?.groups?.url;
  if (!openApiUrl) {
    throw new Error(
      'Could not resolve OPENAPI_URL from src/util/openapi/constants.ts'
    );
  }
  return openApiUrl;
}

function toSchemaObject(schema) {
  return schema && typeof schema === 'object' ? schema : null;
}

function resolveSchemaRef(schema, componentsSchemas) {
  const schemaObject = toSchemaObject(schema);
  if (!schemaObject) {
    return null;
  }

  if (typeof schemaObject.$ref === 'string') {
    const match = schemaObject.$ref.match(/^#\/components\/schemas\/(.+)$/);
    if (!match) {
      return null;
    }
    const resolved = componentsSchemas[match[1]];
    return resolveSchemaRef(resolved, componentsSchemas);
  }

  if (Array.isArray(schemaObject.allOf) && schemaObject.allOf.length > 0) {
    const merged = { type: 'object', properties: {}, required: [] };
    for (const subSchema of schemaObject.allOf) {
      const resolvedSubSchema = resolveSchemaRef(subSchema, componentsSchemas);
      if (!resolvedSubSchema) {
        continue;
      }
      if (resolvedSubSchema.properties) {
        merged.properties = {
          ...merged.properties,
          ...resolvedSubSchema.properties,
        };
      }
      if (Array.isArray(resolvedSubSchema.required)) {
        merged.required = [...merged.required, ...resolvedSubSchema.required];
      }
    }
    return merged;
  }

  return schemaObject;
}

function collectBodyFieldNames(operation, componentsSchemas) {
  const schema =
    operation?.requestBody?.content?.['application/json']?.schema ?? null;
  const resolved = resolveSchemaRef(schema, componentsSchemas);
  if (!resolved?.properties || typeof resolved.properties !== 'object') {
    return [];
  }
  return Object.keys(resolved.properties);
}

function collectOperationEntries(spec) {
  const paths =
    spec && typeof spec === 'object' && spec.paths && typeof spec.paths === 'object'
      ? spec.paths
      : {};
  const componentsSchemas =
    spec &&
    typeof spec === 'object' &&
    spec.components &&
    typeof spec.components === 'object' &&
    spec.components.schemas &&
    typeof spec.components.schemas === 'object'
      ? spec.components.schemas
      : {};

  const entries = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') {
      continue;
    }

    const pathParameters = Array.isArray(pathItem.parameters)
      ? pathItem.parameters
      : [];

    for (const method of OPENAPI_METHODS) {
      const operation = pathItem[method];
      if (!operation || typeof operation !== 'object') {
        continue;
      }

      const operationId =
        typeof operation.operationId === 'string'
          ? operation.operationId.trim()
          : '';
      if (!operationId) {
        continue;
      }

      const tags = Array.isArray(operation.tags) ? operation.tags : [];
      const inputKeys = new Set();
      const operationParameters = Array.isArray(operation.parameters)
        ? operation.parameters
        : [];
      for (const parameter of [...pathParameters, ...operationParameters]) {
        if (
          parameter &&
          typeof parameter === 'object' &&
          typeof parameter.in === 'string' &&
          ['path', 'query', 'header', 'cookie'].includes(parameter.in) &&
          typeof parameter.name === 'string' &&
          parameter.name.trim()
        ) {
          inputKeys.add(`${parameter.in}.${parameter.name.trim()}`);
        }
      }

      for (const bodyFieldName of collectBodyFieldNames(
        operation,
        componentsSchemas
      )) {
        if (bodyFieldName.trim()) {
          inputKeys.add(`bodyFields.${bodyFieldName.trim()}`);
        }
      }

      entries.push({
        tags: tags
          .filter(tag => typeof tag === 'string')
          .map(tag => tag.trim())
          .filter(Boolean),
        operationId,
        inputNames: Array.from(inputKeys).sort(),
        path,
      });
    }
  }

  return entries;
}

function collectTagEntries(operationEntries) {
  const operationsByTag = new Map();
  for (const entry of operationEntries) {
    for (const tag of entry.tags) {
      let operationIds = operationsByTag.get(tag);
      if (!operationIds) {
        operationIds = new Set();
        operationsByTag.set(tag, operationIds);
      }
      operationIds.add(entry.operationId);
    }
  }

  return Array.from(operationsByTag.entries())
    .map(([tag, operationIds]) => [tag, Array.from(operationIds).sort()])
    .sort(([a], [b]) => a.localeCompare(b));
}

function collectInputEntries(operationEntries) {
  const inputsByTag = new Map();

  for (const entry of operationEntries) {
    for (const tag of entry.tags) {
      let operationsById = inputsByTag.get(tag);
      if (!operationsById) {
        operationsById = new Map();
        inputsByTag.set(tag, operationsById);
      }

      let inputNames = operationsById.get(entry.operationId);
      if (!inputNames) {
        inputNames = new Set();
        operationsById.set(entry.operationId, inputNames);
      }

      for (const name of entry.inputNames) {
        inputNames.add(name);
      }
    }
  }

  return Array.from(inputsByTag.entries())
    .map(([tag, operationsById]) => [
      tag,
      Array.from(operationsById.entries())
        .map(([operationId, inputNames]) => [
          operationId,
          Array.from(inputNames).sort(),
        ])
        .sort(([a], [b]) => a.localeCompare(b)),
    ])
    .sort(([a], [b]) => a.localeCompare(b));
}

function buildGeneratedTypesSource(tagEntries, inputEntries) {
  const tagUnion =
    tagEntries.length > 0
      ? tagEntries.map(([tag]) => `  | ${toTsStringLiteral(tag)}`).join('\n')
      : '  | never';

  const interfaceLines = tagEntries.map(([tag, operationIds]) => {
    const operationUnion =
      operationIds.length > 0
        ? operationIds.map(id => toTsStringLiteral(id)).join(' | ')
        : 'never';
    return `  ${toTsStringLiteral(tag)}: ${operationUnion};`;
  });

  const inputInterfaceLines = inputEntries.map(([tag, operationEntries]) => {
    const operationLines = operationEntries.map(([operationId, inputNames]) => {
      const inputUnion =
        inputNames.length > 0
          ? inputNames.map(name => toTsStringLiteral(name)).join(' | ')
          : 'never';
      return `    ${toTsStringLiteral(operationId)}: ${inputUnion};`;
    });

    return `  ${toTsStringLiteral(tag)}: {\n${operationLines.join('\n')}\n  };`;
  });

  return `// This file is auto-generated by scripts/generate-openapi-command-dsl-types.mjs.
// Do not edit manually.

export type OpenApiCommandTag =
${tagUnion};

export interface OpenApiOperationIdsByTag {
${interfaceLines.join('\n')}
}

export interface OpenApiInputNamesByTagOperation {
${inputInterfaceLines.join('\n')}
}
`;
}

export async function generateOpenApiCommandDslTypes() {
  const openApiUrl = readOpenApiUrl();
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), FETCH_TIMEOUT_MS);

  let spec;
  try {
    const response = await fetch(openApiUrl, {
      signal: abortController.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch OpenAPI spec from ${openApiUrl}: ${response.status}`
      );
    }
    spec = await response.json();
  } finally {
    clearTimeout(timeout);
  }

  const operationEntries = collectOperationEntries(spec);
  const source = buildGeneratedTypesSource(
    collectTagEntries(operationEntries),
    collectInputEntries(operationEntries)
  );
  const existing = existsSync(generatedTypesPath)
    ? readFileSync(generatedTypesPath, 'utf8')
    : null;
  if (existing !== source) {
    writeFileSync(generatedTypesPath, source, 'utf8');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await generateOpenApiCommandDslTypes();
}
