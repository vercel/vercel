import Ajv from 'ajv';
import assert from 'assert';
import { join } from 'path';
import { existsSync } from 'fs';
import { isString } from 'util';
import { URL, URLSearchParams } from 'url';
import frameworkList from '../src/frameworks';

// bump timeout for Windows as network can be slower
jest.setTimeout(15 * 1000);

const logoPrefix = 'https://api-frameworks.vercel.sh/framework-logos/';

const SchemaFrameworkDetectionItem = {
  type: 'array',
  items: [
    {
      type: 'object',
      required: [],
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
        },
        matchContent: {
          type: 'string',
        },
        matchPackage: {
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
          type: ['string', 'null'],
        },
        placeholder: {
          type: 'string',
        },
      },
    },
    {
      type: 'object',
      required: ['value', 'ignorePackageJsonScript'],
      additionalProperties: false,
      properties: {
        value: {
          type: 'string',
        },
        placeholder: {
          type: 'string',
        },
        ignorePackageJsonScript: {
          type: 'boolean',
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

const RouteSchema = {
  type: 'array',
  items: {
    properties: {
      src: { type: 'string' },
      dest: { type: 'string' },
      status: { type: 'number' },
      handle: { type: 'string' },
      headers: { type: 'object' },
      continue: { type: 'boolean' },
    },
  },
};

const Schema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: [
      'name',
      'slug',
      'logo',
      'description',
      'settings',
      'getOutputDirName',
    ],
    properties: {
      name: { type: 'string' },
      slug: { type: ['string', 'null'] },
      sort: { type: 'number' },
      logo: { type: 'string' },
      darkModeLogo: { type: 'string' },
      screenshot: { type: 'string' },
      demo: { type: 'string' },
      tagline: { type: 'string' },
      website: { type: 'string' },
      description: { type: 'string' },
      envPrefix: { type: 'string' },
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
      getOutputDirName: {
        isFunction: true,
      },
      defaultRoutes: {
        oneOf: [{ isFunction: true }, RouteSchema],
      },
      defaulHeaders: {
        type: 'array',
        items: {
          properties: {
            source: { type: 'string' },
            regex: { type: 'string' },
            headers: { type: 'object' },
            continue: { type: 'boolean' },
          },
        },
      },
      disableRootMiddleware: {
        type: 'boolean',
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
      defaultVersion: { type: 'string' },
      supersedes: { type: 'array', items: { type: 'string' } },
      experimental: { type: 'boolean' },
      runtimeFramework: { type: 'boolean' },
    },
  },
};

async function getDeployment(host: string) {
  const query = new URLSearchParams();
  query.set('url', host);
  const res = await fetch(
    `https://api.vercel.com/v11/deployments/get?${query}`
  );
  const body = await res.json();
  return body;
}

describe('frameworks', () => {
  const skipExamples = [
    'dojo',
    'saber',
    'gridsome',
    'sanity-v3',
    'scully',
    'solidstart',
    'sanity', // https://linear.app/vercel/issue/ZERO-3238/unskip-tests-failing-due-to-node-16-removal
    'vuepress', // https://linear.app/vercel/issue/ZERO-3238/unskip-tests-failing-due-to-node-16-removal
  ];

  it('ensure there is an example for every framework', async () => {
    const root = join(__dirname, '..', '..', '..');
    const getExample = (name: string) => join(root, 'examples', name);

    const result = frameworkList
      .filter(f => !f.experimental) // Skip experimental frameworks
      .filter(f => !f.runtimeFramework) // Skip runtime frameworks (e.g. Python, Go)
      .map(f => f.slug)
      .filter(isString)
      .filter(slug => !skipExamples.includes(slug))
      .filter(f => existsSync(getExample(f)) === false);

    expect(result).toEqual([]);
  });

  it('ensure schema', async () => {
    const ajv = getValidator();

    const result = ajv.validate(Schema, frameworkList);

    if (ajv.errors) {
      console.error(ajv.errors);
    }

    expect(result).toBe(true);
  });

  it('ensure logo starts with url prefix', async () => {
    const invalid = frameworkList
      .map(f => f.logo)
      .filter(logo => {
        return logo && !logo.startsWith(logoPrefix);
      });

    expect(invalid).toEqual([]);
  });

  it('ensure darkModeLogo starts with url prefix', async () => {
    const invalid = frameworkList
      .map(f => f.darkModeLogo)
      .filter(darkModeLogo => {
        return darkModeLogo && !darkModeLogo.startsWith(logoPrefix);
      });

    expect(invalid).toEqual([]);
  });

  it('ensure logo file exists in ./packages/frameworks/logos/', async () => {
    const missing = frameworkList
      .map(f => f.logo)
      .filter(logo => {
        const filename = logo.slice(logoPrefix.length);
        const filepath = join(__dirname, '..', 'logos', filename);
        return existsSync(filepath) === false;
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

  it('ensure all demo URLs are "public"', async () => {
    await Promise.all(
      frameworkList
        .filter(f => typeof f.demo === 'string')
        .map(async f => {
          const url = new URL(f.demo!);
          const deployment = await getDeployment(url.hostname);
          assert.equal(
            deployment.public,
            true,
            `Demo URL ${f.demo} is not "public". Disable "build logs and source protection" in project settings.`
          );
        })
    );
  });
});

function getValidator() {
  const ajv = new Ajv();

  ajv.addKeyword('isFunction', {
    compile: shouldMatch => data => {
      const matches = typeof data === 'function';
      return (shouldMatch && matches) || (!shouldMatch && !matches);
    },
  });

  return ajv;
}
