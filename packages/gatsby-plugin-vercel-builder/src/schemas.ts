import type {
  IGatsbyPage,
  IGatsbyFunction,
  IRedirect,
  IGatsbyConfig,
} from 'gatsby/dist/redux/types';
import Ajv, { JSONSchemaType } from 'ajv';

export type GatsbyPage = Pick<IGatsbyPage, 'mode' | 'path'>;
const GatsbyPageSchema: JSONSchemaType<GatsbyPage> = {
  type: 'object',
  properties: {
    mode: {
      type: 'string',
      enum: ['SSG', 'DSG', 'SSR'],
    },
    path: {
      type: 'string',
    },
  },
  required: ['mode', 'path'],
} as const;

export interface GatsbyState {
  pages: Array<[string, GatsbyPage]>;
  redirects: Array<GatsbyRedirect>;
  functions: Array<GatsbyFunction>;
  config: GatsbyConfig;
}

export type GatsbyFunction = Pick<
  IGatsbyFunction,
  'functionRoute' | 'originalAbsoluteFilePath'
>;
const GatsbyFunctionSchema: JSONSchemaType<GatsbyFunction> = {
  type: 'object',
  properties: {
    functionRoute: { type: 'string' },
    originalAbsoluteFilePath: { type: 'string' },
  },
  required: ['functionRoute', 'originalAbsoluteFilePath'],
} as const;

export type GatsbyRedirect = Pick<
  IRedirect,
  'fromPath' | 'toPath' | 'isPermanent'
>;
const GatsbyRedirectSchema: JSONSchemaType<GatsbyRedirect> = {
  type: 'object',
  properties: {
    fromPath: { type: 'string' },
    toPath: { type: 'string' },
    isPermanent: { type: 'boolean', nullable: true },
  },
  required: ['fromPath', 'toPath'],
} as const;

export type GatsbyConfig = Pick<IGatsbyConfig, 'trailingSlash'>;

const GatsbyConfigSchema: JSONSchemaType<GatsbyConfig> = {
  type: 'object',
  properties: {
    trailingSlash: {
      type: 'string',
      enum: ['always', 'never', 'ignore', 'legacy'],
      nullable: true,
    },
  },
} as const;

const GatsbyStateSchema: JSONSchemaType<GatsbyState> = {
  type: 'object',
  properties: {
    pages: {
      type: 'array',
      items: {
        type: 'array',
        minItems: 2,
        maxItems: 2,
        items: [{ type: 'string' }, GatsbyPageSchema],
      },
    },
    redirects: {
      type: 'array',
      items: GatsbyRedirectSchema,
    },
    functions: {
      type: 'array',
      items: GatsbyFunctionSchema,
    },
    config: GatsbyConfigSchema,
  },
  required: ['pages', 'redirects', 'functions', 'config'],
  additionalProperties: true,
} as const;

export const ajv = new Ajv({ allErrors: true });
export const validateGatsbyState = ajv.compile(GatsbyStateSchema);
