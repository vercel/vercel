import { generateRoutes } from '../../src/lib/routes';

describe('generateRoutes', () => {
  it('should filter out entry point route', () => {
    const staticRoutes = ['api/main.rs', 'api/foo.rs', 'api/bar/baz.rs'];

    expect(generateRoutes(staticRoutes)).toMatchInlineSnapshot(`
      [
        {
          "dest": "/api/bar/baz",
          "path": "api/bar/baz",
          "src": "/api/bar/baz",
        },
        {
          "dest": "/api/foo",
          "path": "api/foo",
          "src": "/api/foo",
        },
      ]
    `);
  });

  it('should generate static routes', () => {
    const staticRoutes = ['api/foo.rs', 'api/bar/baz.rs'];

    expect(generateRoutes(staticRoutes)).toMatchInlineSnapshot(`
      [
        {
          "dest": "/api/bar/baz",
          "path": "api/bar/baz",
          "src": "/api/bar/baz",
        },
        {
          "dest": "/api/foo",
          "path": "api/foo",
          "src": "/api/foo",
        },
      ]
    `);
  });

  it('should generate dynamic routes', () => {
    const dynamicRoutes = [
      'api/post/[id].rs',
      'api/post/[id]/comments/[commentId].rs',
    ];

    expect(generateRoutes(dynamicRoutes)).toMatchInlineSnapshot(`
      [
        {
          "dest": "/api/post/[id]/comments/[commentId]?id=$id&commentId=$commentId",
          "path": "api/post/[id]/comments/[commentId]",
          "src": "/api/post/(?<id>[^/]+)/comments/(?<commentId>[^/]+)",
        },
        {
          "dest": "/api/post/[id]?id=$id",
          "path": "api/post/[id]",
          "src": "/api/post/(?<id>[^/]+)",
        },
      ]
    `);
  });

  it('should generate catch-all routes', () => {
    const catchAllRoutes = [
      'api/[...rootAll].rs',
      'api/all/[...all].rs',
      'api/optional/[[...id]].rs',
    ];

    expect(generateRoutes(catchAllRoutes)).toMatchInlineSnapshot(`
      [
        {
          "dest": "/api/all/[...all]",
          "path": "api/all/[...all]",
          "src": "/api/all/(\\S+)",
        },
        {
          "dest": "/api/optional/[[...id]]",
          "path": "api/optional/[[...id]]",
          "src": "/api/optional/(/\\S+)?",
        },
        {
          "dest": "/api/[...rootAll]",
          "path": "api/[...rootAll]",
          "src": "/api/(\\S+)",
        },
      ]
    `);
  });

  it('should sort all routes correctly', () => {
    const allRoutes = [
      'api/post/[id].rs',
      'api/post/[id]/comments/[commentId].rs',
      'api/[...rootAll].rs',
      'api/all/[...all].rs',
      'api/optional/[[...id]].rs',
    ];

    expect(generateRoutes(allRoutes)).toMatchInlineSnapshot(`
      [
        {
          "dest": "/api/post/[id]/comments/[commentId]?id=$id&commentId=$commentId",
          "path": "api/post/[id]/comments/[commentId]",
          "src": "/api/post/(?<id>[^/]+)/comments/(?<commentId>[^/]+)",
        },
        {
          "dest": "/api/post/[id]?id=$id",
          "path": "api/post/[id]",
          "src": "/api/post/(?<id>[^/]+)",
        },
        {
          "dest": "/api/all/[...all]",
          "path": "api/all/[...all]",
          "src": "/api/all/(\\S+)",
        },
        {
          "dest": "/api/optional/[[...id]]",
          "path": "api/optional/[[...id]]",
          "src": "/api/optional/(/\\S+)?",
        },
        {
          "dest": "/api/[...rootAll]",
          "path": "api/[...rootAll]",
          "src": "/api/(\\S+)",
        },
      ]
    `);
  });
});
