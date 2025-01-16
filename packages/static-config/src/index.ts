import {
  Project,
  SourceFile,
  SyntaxKind,
  NodeFlags,
  ObjectLiteralExpression,
  Node,
  ArrayLiteralExpression,
} from 'ts-morph';
import { FromSchema, JSONSchema } from 'json-schema-to-ts';
import { validate } from './validation';

export const BaseFunctionConfigSchema = {
  type: 'object',
  properties: {
    runtime: { type: 'string' },
    memory: { type: 'number' },
    maxDuration: { type: 'number' },
    regions: {
      oneOf: [
        {
          type: 'array',
          minItems: 1,
          items: { type: 'string' },
        },
        {
          enum: ['all', 'default', 'auto'],
        },
      ],
    },
  },
} as const;

export type BaseFunctionConfig = FromSchema<typeof BaseFunctionConfigSchema>;

export function getConfig<
  T extends JSONSchema = typeof BaseFunctionConfigSchema,
>(project: Project, sourcePath: string, schema?: T): FromSchema<T> | null {
  const sourceFile = project.addSourceFileAtPath(sourcePath);
  const configNode = getConfigNode(sourceFile);
  if (!configNode) return null;
  const config = getValue(configNode);
  // @ts-ignore
  return validate(schema || BaseFunctionConfigSchema, config);
}

function getConfigNode(sourceFile: SourceFile) {
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)
    .find(objectLiteral => {
      // Make sure the object is assigned to "config"
      const varDec = objectLiteral.getParentIfKind(
        SyntaxKind.VariableDeclaration
      );
      if (varDec?.getName() !== 'config') return false;

      // Make sure assigned with `const`
      const varDecList = varDec.getParentIfKind(
        SyntaxKind.VariableDeclarationList
      );
      const isConst = (varDecList?.getFlags() ?? 0) & NodeFlags.Const;
      if (!isConst) return false;

      // Make sure it is exported
      const exp = varDecList?.getParentIfKind(SyntaxKind.VariableStatement);
      if (!exp?.isExported()) return false;

      return true;
    });
}

function getValue(valueNode: Node): unknown {
  if (Node.isStringLiteral(valueNode)) {
    return eval(valueNode.getText());
  } else if (Node.isNumericLiteral(valueNode)) {
    return Number(valueNode.getText());
  } else if (Node.isTrueLiteral(valueNode)) {
    return true;
  } else if (Node.isFalseLiteral(valueNode)) {
    return false;
  } else if (Node.isNullLiteral(valueNode)) {
    return null;
  } else if (Node.isArrayLiteralExpression(valueNode)) {
    return getArray(valueNode);
  } else if (Node.isObjectLiteralExpression(valueNode)) {
    return getObject(valueNode);
  } else if (
    Node.isIdentifier(valueNode) &&
    valueNode.getText() === 'undefined'
  ) {
    return undefined;
  }
  throw new Error(
    `Unhandled type: "${valueNode.getKindName()}" ${valueNode.getText()}`
  );
}

function getObject(obj: ObjectLiteralExpression): unknown {
  const rtn: { [v: string]: unknown } = {};
  for (const prop of obj.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) continue;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [nameNode, _colon, valueNode] = prop.getChildren();
    const name = nameNode.getText();
    rtn[name] = getValue(valueNode);
  }
  return rtn;
}

function getArray(arr: ArrayLiteralExpression): unknown {
  const elementNodes = arr.getElements();
  const rtn = new Array(elementNodes.length);
  for (let i = 0; i < elementNodes.length; i++) {
    rtn[i] = getValue(elementNodes[i]);
  }
  return rtn;
}
