import Ajv from 'ajv';
import { Static, Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';

export const ajv = new Ajv({ allErrors: true });

function StringEnum<T extends string[]>(values: [...T]) {
  return Type.Unsafe<T[number]>({ type: 'string', enum: values });
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
});
export type GatsbyConfig = Static<typeof GatsbyConfigSchema>;

const GatsbyStateSchema = Type.Object({
  pages: Type.Array(Type.Tuple([Type.String(), GatsbyPageSchema])),
  redirects: Type.Array(GatsbyRedirectSchema),
  functions: Type.Array(GatsbyFunctionSchema),
  config: GatsbyConfigSchema,
});
export type GatsbyState = Static<typeof GatsbyStateSchema>;

//export const validateGatsbyState = ajv.compile(GatsbyStateSchema);
const C = TypeCompiler.Compile(GatsbyStateSchema);
export const validateGatsbyState = C.Check;
