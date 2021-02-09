import Ajv from 'ajv';
import assert from 'assert';
import { join } from 'path';
import { existsSync } from 'fs';
import { isString } from 'util';
import frameworkList from '../src/frameworks';

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
    required: [
      'name',
      'slug',
      'logo',
      'description',
      'settings',
      'buildCommand',
      'devCommand',
    ],
    properties: {
      name: { type: 'string' },
      slug: { type: ['string', 'null'] },
      sort: { type: 'number' },
      logo: { type: 'string' },
      demo: { type: 'string' },
      tagline: { type: 'string' },
      website: { type: 'string' },
      description: { type: 'string' },
      useRuntime: {
        type: 'object',
        required: ['src', 'use'],
        additionalProperties: false,
        properties: {
          src: { type: 'string' },
          use: { type: 'string' },
        },
      },
      ignoreRuntimes: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
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
        required: [
          'installCommand',
          'buildCommand',
          'devCommand',
          'outputDirectory',
        ],
        additionalProperties: false,
        properties: {
          installCommand: SchemaSettings,
          buildCommand: SchemaSettings,
          devCommand: SchemaSettings,
          outputDirectory: SchemaSettings,
        },
      },
      recommendedIntegrations: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'dependencies'],
          additionalProperties: false,
          properties: {
            id: {
              type: 'string',
            },
            dependencies: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
          },
        },
      },

      dependency: { type: 'string' },
      cachePattern: { type: 'string' },
      buildCommand: { type: ['string', 'null'] },
      devCommand: { type: ['string', 'null'] },
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

  it('ensure unique slug', async () => {
    const slugs = new Set<string>();
    for (const { slug } of frameworkList) {
      if (typeof slug === 'string') {
        assert(!slugs.has(slug), `Slug "${slug}" is not unique`);
        slugs.add(slug);
      }
    }
  });
});
