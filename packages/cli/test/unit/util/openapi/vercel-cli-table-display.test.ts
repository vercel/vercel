import { describe, expect, it } from 'vitest';
import { OpenApiCache } from '../../../../src/util/openapi/openapi-cache';
import type { EndpointInfo } from '../../../../src/util/openapi/types';

const miniSpec = {
  openapi: '3.0.3',
  info: { title: 't', version: '1' },
  paths: {
    '/v2/user': {
      get: {
        operationId: 'getAuthUser',
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  'x-vercel-cli': { displayProperty: 'user' },
                  properties: {
                    user: {
                      oneOf: [
                        { $ref: '#/components/schemas/AuthUser' },
                        { $ref: '#/components/schemas/AuthUserLimited' },
                      ],
                    },
                  },
                  required: ['user'],
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      AuthUser: {
        type: 'object',
        'x-vercel-cli': { displayColumns: ['id', 'email'] },
        properties: {
          id: { type: 'string' },
          email: { type: 'string' },
        },
      },
      AuthUserLimited: {
        type: 'object',
        'x-vercel-cli': { displayColumns: ['limited', 'id'] },
        properties: {
          limited: { type: 'boolean', enum: [true] },
          id: { type: 'string' },
        },
      },
    },
  },
};

/** Published openapi.vercel.sh shape: no `x-vercel-cli` anywhere. */
const publishedStyleSpec = {
  openapi: '3.0.3',
  info: { title: 't', version: '1' },
  paths: {
    '/v2/user': {
      get: {
        operationId: 'getAuthUser',
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: {
                      oneOf: [
                        { $ref: '#/components/schemas/AuthUser' },
                        { $ref: '#/components/schemas/AuthUserLimited' },
                      ],
                    },
                  },
                  required: ['user'],
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      AuthUser: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string' },
          name: { type: 'string', nullable: true },
          username: { type: 'string' },
          defaultTeamId: { type: 'string', nullable: true },
          createdAt: { type: 'number' },
          softBlock: {
            type: 'object',
            properties: {
              blockedAt: { type: 'number' },
              reason: { type: 'string' },
            },
          },
        },
      },
      AuthUserLimited: {
        type: 'object',
        properties: {
          limited: { type: 'boolean', enum: [true] },
          id: { type: 'string' },
          email: { type: 'string' },
          name: { type: 'string', nullable: true },
          username: { type: 'string' },
          defaultTeamId: { type: 'string', nullable: true },
          avatar: { type: 'string', nullable: true },
        },
      },
    },
  },
};

const getProjectsListSpec = {
  openapi: '3.0.3',
  info: { title: 't', version: '1' },
  paths: {
    '/v10/projects': {
      get: {
        operationId: 'getProjects',
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  nullable: true,
                  oneOf: [
                    {
                      type: 'array',
                      items: { type: 'string' },
                    },
                    {
                      type: 'object',
                      required: ['pagination', 'projects'],
                      properties: {
                        projects: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              name: { type: 'string' },
                              accountId: { type: 'string' },
                              framework: { type: 'string', nullable: true },
                              createdAt: { type: 'number' },
                            },
                          },
                        },
                        pagination: {
                          type: 'object',
                          properties: {
                            count: { type: 'number' },
                            next: { type: 'string', nullable: true },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  },
};

describe('OpenApiCache.getVercelCliTableDisplay', () => {
  it('resolves oneOf AuthUser / AuthUserLimited columns', async () => {
    const cache = new OpenApiCache();
    (cache as unknown as { spec: typeof miniSpec }).spec = miniSpec;
    const ep: EndpointInfo = {
      path: '/v2/user',
      method: 'GET',
      summary: '',
      description: '',
      operationId: 'getAuthUser',
      tags: ['user'],
      parameters: [],
      responses: miniSpec.paths['/v2/user'].get.responses,
      vercelCliSupported: true,
      vercelCliAliases: [],
    };
    const d = cache.getVercelCliTableDisplay(ep);
    expect(d).toEqual({
      displayProperty: 'user',
      columnsDefault: ['id', 'email'],
      columnsWhenLimited: ['limited', 'id'],
    });
  });

  it('infers table layout when the spec omits x-vercel-cli (published OpenAPI)', async () => {
    const cache = new OpenApiCache();
    (cache as unknown as { spec: typeof publishedStyleSpec }).spec =
      publishedStyleSpec;
    const ep: EndpointInfo = {
      path: '/v2/user',
      method: 'GET',
      summary: '',
      description: '',
      operationId: 'getAuthUser',
      tags: ['user'],
      parameters: [],
      responses: publishedStyleSpec.paths['/v2/user'].get.responses,
      vercelCliSupported: true,
      vercelCliAliases: [],
    };
    const d = cache.getVercelCliTableDisplay(ep);
    expect(d?.displayProperty).toBe('user');
    expect(d?.columnsDefault?.length).toBeGreaterThan(0);
    expect(d?.columnsDefault).toContain('id');
    expect(d?.columnsWhenLimited?.length).toBeGreaterThan(0);
    expect(d?.columnsWhenLimited).toContain('limited');
  });

  it('unwraps oneOf and resolves list projects ({ projects, pagination }) columns', () => {
    const cache = new OpenApiCache();
    (cache as unknown as { spec: typeof getProjectsListSpec }).spec =
      getProjectsListSpec;
    const ep: EndpointInfo = {
      path: '/v10/projects',
      method: 'GET',
      summary: '',
      description: '',
      operationId: 'getProjects',
      tags: ['projects'],
      parameters: [],
      responses: getProjectsListSpec.paths['/v10/projects'].get.responses,
      vercelCliSupported: true,
      vercelCliAliases: [],
    };
    const d = cache.getVercelCliTableDisplay(ep);
    expect(d?.displayProperty).toBe('projects');
    expect(d?.columnsDefault).toEqual([
      'id',
      'name',
      'accountId',
      'framework',
      'createdAt',
    ]);
  });
});

describe('OpenApiCache.describeResponseCliColumns', () => {
  it('returns types for list projects columns', () => {
    const cache = new OpenApiCache();
    (cache as unknown as { spec: typeof getProjectsListSpec }).spec =
      getProjectsListSpec;
    const ep: EndpointInfo = {
      path: '/v10/projects',
      method: 'GET',
      summary: '',
      description: '',
      operationId: 'getProjects',
      tags: ['projects'],
      parameters: [],
      responses: getProjectsListSpec.paths['/v10/projects'].get.responses,
      vercelCliSupported: true,
      vercelCliAliases: [],
    };
    const d = cache.describeResponseCliColumns(ep);
    expect(d?.displayProperty).toBe('projects');
    expect(d?.defaultColumns).toEqual([
      { path: 'id', type: 'string' },
      { path: 'name', type: 'string' },
      { path: 'accountId', type: 'string' },
      { path: 'framework', type: 'string | null' },
      { path: 'createdAt', type: 'number' },
    ]);
  });

  it('returns default and limited column types for oneOf user response', () => {
    const cache = new OpenApiCache();
    (cache as unknown as { spec: typeof miniSpec }).spec = miniSpec;
    const ep: EndpointInfo = {
      path: '/v2/user',
      method: 'GET',
      summary: '',
      description: '',
      operationId: 'getAuthUser',
      tags: ['user'],
      parameters: [],
      responses: miniSpec.paths['/v2/user'].get.responses,
      vercelCliSupported: true,
      vercelCliAliases: [],
    };
    const d = cache.describeResponseCliColumns(ep);
    expect(d?.displayProperty).toBe('user');
    expect(d?.defaultColumns).toEqual([
      { path: 'id', type: 'string' },
      { path: 'email', type: 'string' },
    ]);
    expect(d?.limitedColumns).toEqual([
      { path: 'limited', type: 'true' },
      { path: 'id', type: 'string' },
    ]);
  });
});
