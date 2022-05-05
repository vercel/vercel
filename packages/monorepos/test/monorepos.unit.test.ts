import Ajv from 'ajv';
import assert from 'assert';
import { join } from 'path';
import { existsSync } from 'fs';
import { isString } from 'util';
import fetch from 'node-fetch';
import { URL, URLSearchParams } from 'url';
import monorepoList from '../src/monorepos';

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

const Schema = {
  type: 'array',
  items: {
    type: 'object',
    required: ['name', 'slug'],
    properties: {
      name: { type: 'string' },
      slug: { type: ['string', 'null'] },
      demo: { type: 'string' },
      website: { type: 'string' },
      detectors: {
        type: 'object',
        additionalProperties: false,
        properties: {
          every: SchemaFrameworkDetectionItem,
          some: SchemaFrameworkDetectionItem,
        },
      },
      defaultVersion: { type: 'string' },
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

describe('monorepos', () => {
  it('ensure there is an example for every framework', async () => {
    const root = join(__dirname, '..', '..', '..');
    const getExample = (name: string) => join(root, 'examples', name);

    const result = monorepoList
      .map(f => f.slug)
      .filter(isString)
      .filter(f => existsSync(getExample(f)) === false);

    expect(result).toEqual([]);
  });

  it('ensure schema', async () => {
    const ajv = new Ajv();
    const result = ajv.validate(Schema, monorepoList);

    if (ajv.errors) {
      console.error(ajv.errors);
    }

    expect(result).toBe(true);
  });

  it('ensure unique slug', async () => {
    const slugs = new Set<string>();
    for (const { slug } of monorepoList) {
      if (typeof slug === 'string') {
        assert(!slugs.has(slug), `Slug "${slug}" is not unique`);
        slugs.add(slug);
      }
    }
  });

  it('ensure all demo URLs are "public"', async () => {
    await Promise.all(
      monorepoList
        .filter(f => typeof f.demo === 'string')
        .map(async f => {
          const url = new URL(f.demo!);
          const deployment = await getDeployment(url.hostname);
          assert.equal(
            deployment.public,
            true,
            `Demo URL ${f.demo} is not "public"`
          );
        })
    );
  });
});
