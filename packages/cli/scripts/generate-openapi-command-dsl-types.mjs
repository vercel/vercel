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

function resolveSchemaRef(schema, componentsSchemas, seenRefs = new Set()) {
  const schemaObject = toSchemaObject(schema);
  if (!schemaObject) {
    return null;
  }

  if (typeof schemaObject.$ref === 'string') {
    if (seenRefs.has(schemaObject.$ref)) {
      return null;
    }
    const match = schemaObject.$ref.match(/^#\/components\/schemas\/(.+)$/);
    if (!match) {
      return null;
    }
    seenRefs.add(schemaObject.$ref);
    const resolved = componentsSchemas[match[1]];
    const next = resolveSchemaRef(resolved, componentsSchemas, seenRefs);
    seenRefs.delete(schemaObject.$ref);
    return next;
  }

  if (Array.isArray(schemaObject.allOf) && schemaObject.allOf.length > 0) {
    const merged = { type: 'object', properties: {}, required: [] };
    for (const subSchema of schemaObject.allOf) {
      const resolvedSubSchema = resolveSchemaRef(
        subSchema,
        componentsSchemas,
        new Set(seenRefs)
      );
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

function collectObjectFieldNamesFromSchema(
  schema,
  componentsSchemas,
  visited = new WeakSet()
) {
  const resolved = resolveSchemaRef(schema, componentsSchemas);
  if (!resolved) {
    return [];
  }
  if (visited.has(resolved)) {
    return [];
  }
  visited.add(resolved);

  const unionSchemas = [];
  if (Array.isArray(resolved.oneOf)) {
    unionSchemas.push(...resolved.oneOf);
  }
  if (Array.isArray(resolved.anyOf)) {
    unionSchemas.push(...resolved.anyOf);
  }

  if (unionSchemas.length > 0) {
    return Array.from(
      new Set(
        unionSchemas.flatMap(unionSchema =>
          collectObjectFieldNamesFromSchema(
            unionSchema,
            componentsSchemas,
            visited
          )
        )
      )
    );
  }

  if (resolved.type === 'array' && resolved.items) {
    return collectObjectFieldNamesFromSchema(
      resolved.items,
      componentsSchemas,
      visited
    );
  }

  if (resolved.properties && typeof resolved.properties === 'object') {
    return Object.keys(resolved.properties);
  }

  return [];
}

function collectDisplayFieldsByProperty(operation, componentsSchemas) {
  const responses =
    operation?.responses && typeof operation.responses === 'object'
      ? operation.responses
      : {};
  const successResponseSchemas = Object.entries(responses)
    .filter(([statusCode]) => /^2\d\d$/.test(statusCode))
    .map(
      ([, response]) =>
        response?.content?.['application/json']?.schema ?? null
    )
    .filter(Boolean);

  const fieldsByProperty = new Map();

  for (const responseSchema of successResponseSchemas) {
    const resolvedResponseSchema = resolveSchemaRef(responseSchema, componentsSchemas);
    if (!resolvedResponseSchema) {
      continue;
    }

    const variants = [
      resolvedResponseSchema,
      ...(Array.isArray(resolvedResponseSchema.oneOf)
        ? resolvedResponseSchema.oneOf
        : []),
      ...(Array.isArray(resolvedResponseSchema.anyOf)
        ? resolvedResponseSchema.anyOf
        : []),
    ];

    for (const variant of variants) {
      const resolvedVariant = resolveSchemaRef(variant, componentsSchemas);
      if (
        !resolvedVariant ||
        !resolvedVariant.properties ||
        typeof resolvedVariant.properties !== 'object'
      ) {
        continue;
      }

      for (const [propertyName, propertySchema] of Object.entries(
        resolvedVariant.properties
      )) {
        if (!propertyName.trim()) {
          continue;
        }

        const propertyFields = collectObjectFieldNamesFromSchema(
          propertySchema,
          componentsSchemas
        );
        if (propertyFields.length === 0) {
          continue;
        }

        let fieldSet = fieldsByProperty.get(propertyName);
        if (!fieldSet) {
          fieldSet = new Set();
          fieldsByProperty.set(propertyName, fieldSet);
        }

        for (const fieldName of propertyFields) {
          if (fieldName.trim()) {
            fieldSet.add(fieldName.trim());
          }
        }
      }
    }
  }

  return Array.from(fieldsByProperty.entries())
    .map(([propertyName, fieldSet]) => [propertyName, Array.from(fieldSet).sort()])
    .sort(([a], [b]) => a.localeCompare(b));
}

function toTsPropertyKey(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
    ? name
    : toTsStringLiteral(name);
}

function toTsUnion(types) {
  const uniqueTypes = Array.from(new Set(types.filter(Boolean)));
  if (uniqueTypes.length === 0) {
    return 'unknown';
  }
  if (uniqueTypes.length === 1) {
    return uniqueTypes[0];
  }
  return uniqueTypes.join(' | ');
}

function schemaToTsType(schema, componentsSchemas, visited = new WeakSet()) {
  const resolved = resolveSchemaRef(schema, componentsSchemas);
  if (!resolved) {
    return 'unknown';
  }
  if (visited.has(resolved)) {
    return 'unknown';
  }
  visited.add(resolved);

  const unionSchemas = [];
  if (Array.isArray(resolved.oneOf)) {
    unionSchemas.push(...resolved.oneOf);
  }
  if (Array.isArray(resolved.anyOf)) {
    unionSchemas.push(...resolved.anyOf);
  }
  if (unionSchemas.length > 0) {
    const unionType = toTsUnion(
      unionSchemas.map(entry =>
        schemaToTsType(entry, componentsSchemas, visited)
      )
    );
    visited.delete(resolved);
    return unionType;
  }

  const normalizedTypes = Array.isArray(resolved.type)
    ? resolved.type.filter(Boolean)
    : typeof resolved.type === 'string'
      ? [resolved.type]
      : [];
  if (resolved.nullable === true && !normalizedTypes.includes('null')) {
    normalizedTypes.push('null');
  }

  if (
    normalizedTypes.includes('array') ||
    (!normalizedTypes.length && Boolean(resolved.items))
  ) {
    const itemType = schemaToTsType(
      resolved.items,
      componentsSchemas,
      visited
    );
    visited.delete(resolved);
    return `readonly (${itemType})[]`;
  }

  if (
    normalizedTypes.includes('object') ||
    (!normalizedTypes.length &&
      (resolved.properties || resolved.additionalProperties))
  ) {
    const propertyLines = [];
    if (resolved.properties && typeof resolved.properties === 'object') {
      for (const [propertyName, propertySchema] of Object.entries(
        resolved.properties
      ).sort(([a], [b]) => a.localeCompare(b))) {
        const propertyType = schemaToTsType(
          propertySchema,
          componentsSchemas,
          visited
        );
        propertyLines.push(`readonly ${toTsPropertyKey(propertyName)}: ${propertyType};`);
      }
    }

    const additionalPropertiesType =
      resolved.additionalProperties === true
        ? 'unknown'
        : resolved.additionalProperties
          ? schemaToTsType(
              resolved.additionalProperties,
              componentsSchemas,
              visited
            )
          : null;
    if (additionalPropertiesType) {
      propertyLines.push(`readonly [key: string]: ${additionalPropertiesType};`);
    }

    visited.delete(resolved);
    if (propertyLines.length === 0) {
      return 'Record<string, unknown>';
    }
    return `{\n${propertyLines.map(line => `  ${line}`).join('\n')}\n}`;
  }

  const primitiveTypes = normalizedTypes.filter(type =>
    ['string', 'number', 'integer', 'boolean', 'null'].includes(type)
  );
  if (primitiveTypes.length > 0) {
    const primitiveType = toTsUnion(
      primitiveTypes.map(type =>
        type === 'integer' ? 'number' : type === 'null' ? 'null' : type
      )
    );
    visited.delete(resolved);
    return primitiveType;
  }

  visited.delete(resolved);
  return 'unknown';
}

function collectDisplayShapesByStatusProperty(operation, componentsSchemas) {
  const responses =
    operation?.responses && typeof operation.responses === 'object'
      ? operation.responses
      : {};

  const shapesByStatus = new Map();

  for (const [statusCode, response] of Object.entries(responses)) {
    if (!/^2\d\d$/.test(statusCode)) {
      continue;
    }

    const responseSchema = response?.content?.['application/json']?.schema ?? null;
    if (!responseSchema) {
      continue;
    }

    const resolvedResponseSchema = resolveSchemaRef(responseSchema, componentsSchemas);
    if (!resolvedResponseSchema) {
      continue;
    }

    const variants = [
      resolvedResponseSchema,
      ...(Array.isArray(resolvedResponseSchema.oneOf)
        ? resolvedResponseSchema.oneOf
        : []),
      ...(Array.isArray(resolvedResponseSchema.anyOf)
        ? resolvedResponseSchema.anyOf
        : []),
    ];

    let propertiesByName = shapesByStatus.get(statusCode);
    if (!propertiesByName) {
      propertiesByName = new Map();
      shapesByStatus.set(statusCode, propertiesByName);
    }

    for (const variant of variants) {
      const resolvedVariant = resolveSchemaRef(variant, componentsSchemas);
      if (
        !resolvedVariant ||
        !resolvedVariant.properties ||
        typeof resolvedVariant.properties !== 'object'
      ) {
        continue;
      }

      for (const [propertyName, propertySchema] of Object.entries(
        resolvedVariant.properties
      )) {
        if (!propertyName.trim()) {
          continue;
        }

        const propertyType = schemaToTsType(propertySchema, componentsSchemas);
        let typeSet = propertiesByName.get(propertyName);
        if (!typeSet) {
          typeSet = new Set();
          propertiesByName.set(propertyName, typeSet);
        }
        typeSet.add(propertyType);
      }
    }
  }

  return Array.from(shapesByStatus.entries())
    .map(([statusCode, propertiesByName]) => [
      statusCode,
      Array.from(propertiesByName.entries())
        .map(([propertyName, typeSet]) => [
          propertyName,
          toTsUnion(Array.from(typeSet)),
        ])
        .sort(([a], [b]) => a.localeCompare(b)),
    ])
    .sort(([a], [b]) => a.localeCompare(b));
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
        displayFieldsByProperty: collectDisplayFieldsByProperty(
          operation,
          componentsSchemas
        ),
        displayShapesByStatusProperty: collectDisplayShapesByStatusProperty(
          operation,
          componentsSchemas
        ),
        responseStatusCodes: Object.keys(
          operation?.responses && typeof operation.responses === 'object'
            ? operation.responses
            : {}
        )
          .filter(statusCode => /^\d{3}$/.test(statusCode))
          .sort(),
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

function collectDisplayEntries(operationEntries) {
  const displayFieldsByTag = new Map();

  for (const entry of operationEntries) {
    for (const tag of entry.tags) {
      let operationsById = displayFieldsByTag.get(tag);
      if (!operationsById) {
        operationsById = new Map();
        displayFieldsByTag.set(tag, operationsById);
      }

      let fieldsByProperty = operationsById.get(entry.operationId);
      if (!fieldsByProperty) {
        fieldsByProperty = new Map();
        operationsById.set(entry.operationId, fieldsByProperty);
      }

      for (const [propertyName, fieldNames] of entry.displayFieldsByProperty) {
        let fields = fieldsByProperty.get(propertyName);
        if (!fields) {
          fields = new Set();
          fieldsByProperty.set(propertyName, fields);
        }

        for (const fieldName of fieldNames) {
          fields.add(fieldName);
        }
      }
    }
  }

  return Array.from(displayFieldsByTag.entries())
    .map(([tag, operationsById]) => [
      tag,
      Array.from(operationsById.entries())
        .map(([operationId, fieldsByProperty]) => [
          operationId,
          Array.from(fieldsByProperty.entries())
            .map(([propertyName, fieldNames]) => [
              propertyName,
              Array.from(fieldNames).sort(),
            ])
            .sort(([a], [b]) => a.localeCompare(b)),
        ])
        .sort(([a], [b]) => a.localeCompare(b)),
    ])
    .sort(([a], [b]) => a.localeCompare(b));
}

function collectDisplayShapeEntries(operationEntries) {
  const shapesByTag = new Map();

  for (const entry of operationEntries) {
    for (const tag of entry.tags) {
      let operationsById = shapesByTag.get(tag);
      if (!operationsById) {
        operationsById = new Map();
        shapesByTag.set(tag, operationsById);
      }

      let statusesByCode = operationsById.get(entry.operationId);
      if (!statusesByCode) {
        statusesByCode = new Map();
        operationsById.set(entry.operationId, statusesByCode);
      }

      for (const [statusCode, properties] of entry.displayShapesByStatusProperty) {
        let propertiesByName = statusesByCode.get(statusCode);
        if (!propertiesByName) {
          propertiesByName = new Map();
          statusesByCode.set(statusCode, propertiesByName);
        }

        for (const [propertyName, propertyType] of properties) {
          let types = propertiesByName.get(propertyName);
          if (!types) {
            types = new Set();
            propertiesByName.set(propertyName, types);
          }
          types.add(propertyType);
        }
      }
    }
  }

  return Array.from(shapesByTag.entries())
    .map(([tag, operationsById]) => [
      tag,
      Array.from(operationsById.entries())
        .map(([operationId, statusesByCode]) => [
          operationId,
          Array.from(statusesByCode.entries())
            .map(([statusCode, propertiesByName]) => [
              statusCode,
              Array.from(propertiesByName.entries())
                .map(([propertyName, propertyTypes]) => [
                  propertyName,
                  toTsUnion(Array.from(propertyTypes)),
                ])
                .sort(([a], [b]) => a.localeCompare(b)),
            ])
            .sort(([a], [b]) => a.localeCompare(b)),
        ])
        .sort(([a], [b]) => a.localeCompare(b)),
    ])
    .sort(([a], [b]) => a.localeCompare(b));
}

function collectResponseStatusEntries(operationEntries) {
  const statusesByTag = new Map();

  for (const entry of operationEntries) {
    for (const tag of entry.tags) {
      let operationsById = statusesByTag.get(tag);
      if (!operationsById) {
        operationsById = new Map();
        statusesByTag.set(tag, operationsById);
      }

      let statusCodes = operationsById.get(entry.operationId);
      if (!statusCodes) {
        statusCodes = new Set();
        operationsById.set(entry.operationId, statusCodes);
      }

      for (const statusCode of entry.responseStatusCodes) {
        statusCodes.add(statusCode);
      }
    }
  }

  return Array.from(statusesByTag.entries())
    .map(([tag, operationsById]) => [
      tag,
      Array.from(operationsById.entries())
        .map(([operationId, statusCodes]) => [
          operationId,
          Array.from(statusCodes).sort(),
        ])
        .sort(([a], [b]) => a.localeCompare(b)),
    ])
    .sort(([a], [b]) => a.localeCompare(b));
}

function buildGeneratedTypesSource(
  tagEntries,
  inputEntries,
  displayEntries,
  displayShapeEntries,
  responseStatusEntries
) {
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

  const displayEntriesByTag = new Map(displayEntries);
  const displayPropertyInterfaceLines = tagEntries.map(([tag, operationIds]) => {
    const operationsById = new Map(displayEntriesByTag.get(tag) ?? []);
    const operationLines = operationIds.map(operationId => {
      const properties = operationsById.get(operationId) ?? [];
      const propertyType =
        properties.length > 0
          ? properties
              .map(([propertyName]) => toTsStringLiteral(propertyName))
              .join(' | ')
          : 'never';
      return `    ${toTsStringLiteral(operationId)}: ${propertyType};`;
    });
    return `  ${toTsStringLiteral(tag)}: {\n${operationLines.join('\n')}\n  };`;
  });

  const displayShapeEntriesByTag = new Map(displayShapeEntries);
  const displayPropertyByStatusInterfaceLines = tagEntries.map(
    ([tag, operationIds]) => {
      const operationsById = new Map(displayShapeEntriesByTag.get(tag) ?? []);
      const operationLines = operationIds.map(operationId => {
        const statuses = operationsById.get(operationId) ?? [];
        const statusLines = statuses.map(([statusCode, properties]) => {
          const propertyUnion =
            properties.length > 0
              ? properties
                  .map(([propertyName]) => toTsStringLiteral(propertyName))
                  .join(' | ')
              : 'never';
          return `      ${toTsStringLiteral(statusCode)}: ${propertyUnion};`;
        });
        const statusBody =
          statusLines.length > 0 ? `\n${statusLines.join('\n')}\n    ` : '';
        return `    ${toTsStringLiteral(operationId)}: {${statusBody}};`;
      });
      return `  ${toTsStringLiteral(tag)}: {\n${operationLines.join('\n')}\n  };`;
    }
  );

  const displayResponseShapeByStatusPropertyInterfaceLines = tagEntries.map(
    ([tag, operationIds]) => {
      const operationsById = new Map(displayShapeEntriesByTag.get(tag) ?? []);
      const operationLines = operationIds.map(operationId => {
        const statuses = operationsById.get(operationId) ?? [];
        const statusLines = statuses.map(([statusCode, properties]) => {
          const propertyLines = properties.map(
            ([propertyName, propertyType]) =>
              `        ${toTsStringLiteral(propertyName)}: ${propertyType};`
          );
          const propertyBody =
            propertyLines.length > 0
              ? `\n${propertyLines.join('\n')}\n      `
              : '';
          return `      ${toTsStringLiteral(statusCode)}: {${propertyBody}};`;
        });
        const statusBody =
          statusLines.length > 0 ? `\n${statusLines.join('\n')}\n    ` : '';
        return `    ${toTsStringLiteral(operationId)}: {${statusBody}};`;
      });
      return `  ${toTsStringLiteral(tag)}: {\n${operationLines.join('\n')}\n  };`;
    }
  );

  const displayFieldsInterfaceLines = tagEntries.map(([tag, operationIds]) => {
    const operationsById = new Map(displayEntriesByTag.get(tag) ?? []);
    const operationLines = operationIds.map(operationId => {
      const properties = operationsById.get(operationId) ?? [];
      const fieldNames = Array.from(
        new Set(properties.flatMap(([, names]) => names))
      ).sort();
      const fieldUnion =
        fieldNames.length > 0
          ? fieldNames.map(name => toTsStringLiteral(name)).join(' | ')
          : 'never';
      return `    ${toTsStringLiteral(operationId)}: ${fieldUnion};`;
    });
    return `  ${toTsStringLiteral(tag)}: {\n${operationLines.join('\n')}\n  };`;
  });

  const displayFieldsByPropertyInterfaceLines = tagEntries.map(
    ([tag, operationIds]) => {
      const operationsById = new Map(displayEntriesByTag.get(tag) ?? []);
      const operationLines = operationIds.map(operationId => {
        const properties = operationsById.get(operationId) ?? [];
        const propertyLines = properties.map(([propertyName, fieldNames]) => {
          const fieldUnion =
            fieldNames.length > 0
              ? fieldNames.map(name => toTsStringLiteral(name)).join(' | ')
              : 'never';
          return `      ${toTsStringLiteral(propertyName)}: ${fieldUnion};`;
        });
        const propertyBody =
          propertyLines.length > 0 ? `\n${propertyLines.join('\n')}\n    ` : '';
        return `    ${toTsStringLiteral(operationId)}: {${propertyBody}};`;
      });
      return `  ${toTsStringLiteral(tag)}: {\n${operationLines.join('\n')}\n  };`;
    }
  );

  const statusEntriesByTag = new Map(responseStatusEntries);
  const responseStatusInterfaceLines = tagEntries.map(([tag, operationIds]) => {
    const operationsById = new Map(statusEntriesByTag.get(tag) ?? []);
    const operationLines = operationIds.map(operationId => {
      const statusCodes = operationsById.get(operationId) ?? [];
      const statusUnion =
        statusCodes.length > 0
          ? statusCodes.map(statusCode => toTsStringLiteral(statusCode)).join(' | ')
          : 'never';
      return `    ${toTsStringLiteral(operationId)}: ${statusUnion};`;
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

export interface OpenApiDisplayPropertiesByTagOperation {
${displayPropertyInterfaceLines.join('\n')}
}

export interface OpenApiDisplayFieldsByTagOperation {
${displayFieldsInterfaceLines.join('\n')}
}

export interface OpenApiDisplayFieldsByTagOperationProperty {
${displayFieldsByPropertyInterfaceLines.join('\n')}
}

export interface OpenApiDisplayPropertiesByTagOperationStatus {
${displayPropertyByStatusInterfaceLines.join('\n')}
}

export interface OpenApiDisplayResponseShapeByTagOperationStatusProperty {
${displayResponseShapeByStatusPropertyInterfaceLines.join('\n')}
}

export interface OpenApiResponseStatusCodesByTagOperation {
${responseStatusInterfaceLines.join('\n')}
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
    collectInputEntries(operationEntries),
    collectDisplayEntries(operationEntries),
    collectDisplayShapeEntries(operationEntries),
    collectResponseStatusEntries(operationEntries)
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
