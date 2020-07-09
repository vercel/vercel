import Ajv from 'ajv';
import { join } from 'path';
import { existsSync } from 'fs';
import { Framework } from '../';
const frameworkList = require('../frameworks.json') as Framework[];

function isString(arg: any): arg is string {
  return typeof arg === 'string';
}

const SchemaFrameworkDetectionItem = {
  type: 'array',
  items: [
    {
      type: 'object',
      required: ['path'],
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
        },
        matchContent: {
          type: 'string',
        },
      },
    },
  ],
};

const SchemaSettings = {
  oneOf: [
    {
      type: 'object',
      required: ['value'],
      additionalProperties: false,
      properties: {
        value: {
          type: 'string',
        },
      },
    },
    {
      type: 'object',
      required: ['placeholder'],
      additionalProperties: false,
      properties: {
        placeholder: {
          type: 'string',
        },
      },
    },
  ],
};

const Schema = {
  type: 'array',
  items: {
    type: 'object',
    required: ['name', 'slug', 'logo', 'description', 'settings'],
    additionalProperties: false,
    properties: {
      name: { type: 'string' },
      slug: { type: ['string', 'null'] },
      sort: { type: 'number' },
      logo: { type: 'string' },
      demo: { type: 'string' },
      tagline: { type: 'string' },
      website: { type: 'string' },
      description: { type: 'string' },
      detectors: {
        type: 'object',
        additionalProperties: false,
        properties: {
          every: SchemaFrameworkDetectionItem,
          some: SchemaFrameworkDetectionItem,
        },
      },
      settings: {
        type: 'object',
        required: ['buildCommand', 'devCommand', 'outputDirectory'],
        additionalProperties: false,
        properties: {
          buildCommand: SchemaSettings,
          devCommand: SchemaSettings,
          outputDirectory: SchemaSettings,
        },
      },
    },
  },
};

describe('frameworks', () => {
  it('ensure there is an example for every framework', async () => {
    const root = join(__dirname, '..', '..', '..');
    const getExample = (name: string) => join(root, 'examples', name);

    const result = frameworkList
      .map(f => f.slug)
      .filter(isString)
      .filter(f => existsSync(getExample(f)) === false);

    expect(result).toEqual([]);
  });

  it('ensure schema', async () => {
    const ajv = new Ajv();
    const result = ajv.validate(Schema, frameworkList);

    if (ajv.errors) {
      console.error(ajv.errors);
    }

    expect(result).toBe(true);
  });

  it('ensure logo', async () => {
    const missing = frameworkList
      .map(f => f.logo)
      .filter(url => {
        const prefix =
          'https://raw.githubusercontent.com/vercel/vercel/master/packages/frameworks/logos/';
        const name = url.replace(prefix, '');
        return existsSync(join(__dirname, '..', 'logos', name)) === false;
      });

    expect(missing).toEqual([]);
  });

  it('ensure unique sort number', async () => {
    const sortNumToSlug = new Map<number, string | null>();
    frameworkList.forEach(f => {
      if (f.sort) {
        const duplicateSlug = sortNumToSlug.get(f.sort);
        expect(duplicateSlug).toStrictEqual(undefined);
        sortNumToSlug.set(f.sort, f.slug);
      }
    });
  });
});
