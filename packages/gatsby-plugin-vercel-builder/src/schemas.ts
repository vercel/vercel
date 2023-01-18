import type {
  IGatsbyPage,
  IGatsbyFunction,
  IRedirect,
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
  },
  required: ['pages', 'redirects', 'functions'],
  additionalProperties: true,
} as const;

export const ajv = new Ajv({ allErrors: true });
export const validateGatsbyState = ajv.compile(GatsbyStateSchema);
