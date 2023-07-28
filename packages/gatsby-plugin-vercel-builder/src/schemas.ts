import { Static, Type, Kind } from '@sinclair/typebox';
import { Custom } from '@sinclair/typebox/custom';
import { TypeCompiler } from '@sinclair/typebox/compiler';

Custom.Set<{ enum: string[] }>('StringEnum', (schema, value) => {
  return schema.enum.includes(value as string);
});

function StringEnum<T extends string[]>(values: [...T]) {
  return Type.Unsafe<T[number]>({
    [Kind]: 'StringEnum',
    type: 'string',
    enum: values,
  });
}

const GatsbyPageSchema = Type.Object({
  mode: StringEnum(['SSG', 'DSG', 'SSR']),
  path: Type.String(),
});
export type GatsbyPage = Static<typeof GatsbyPageSchema>;

const GatsbyFunctionSchema = Type.Object({
  functionRoute: Type.String(),
  originalAbsoluteFilePath: Type.String(),
});
export type GatsbyFunction = Static<typeof GatsbyFunctionSchema>;
TypeCompiler.Compile(GatsbyFunctionSchema);

const GatsbyRedirectSchema = Type.Object({
  fromPath: Type.String(),
  toPath: Type.String(),
  isPermanent: Type.Optional(Type.Boolean()),
});
export type GatsbyRedirect = Static<typeof GatsbyRedirectSchema>;

const GatsbyConfigSchema = Type.Object({
  trailingSlash: Type.Optional(
    StringEnum(['always', 'never', 'ignore', 'legacy'])
  ),
  pathPrefix: Type.Optional(Type.String()),
});
export type GatsbyConfig = Static<typeof GatsbyConfigSchema>;

const GatsbyStateSchema = Type.Object({
  pages: Type.Array(Type.Tuple([Type.String(), GatsbyPageSchema])),
  redirects: Type.Array(GatsbyRedirectSchema),
  functions: Type.Array(GatsbyFunctionSchema),
  config: GatsbyConfigSchema,
});
export type GatsbyState = Static<typeof GatsbyStateSchema>;

export const validateGatsbyState = TypeCompiler.Compile(GatsbyStateSchema);
