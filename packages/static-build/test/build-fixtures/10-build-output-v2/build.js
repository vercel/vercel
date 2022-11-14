const fs = require('fs');

fs.mkdirSync('.output/static', { recursive: true });
fs.mkdirSync('.output/server/pages/api', { recursive: true });

fs.writeFileSync(
  '.output/functions-manifest.json',
  JSON.stringify(
    {
      version: 1,
      pages: {
        '_middleware.js': {
          runtime: 'web',
          env: [],
          files: ['server/pages/_middleware.js'],
          name: 'pages/_middleware',
          page: '/',
          regexp: '^/.*$',
          sortingIndex: 1,
        },
      },
    },
    null,
    2
  )
);

fs.writeFileSync('.output/static/index.html', '<h1>Build Output API v2</h1>');

fs.writeFileSync('.output/server/pages/about.html', '<h1>Some Site</h1>');

fs.writeFileSync(
  '.output/server/pages/api/user.js',
  `export default function handler(request, response) {
    response.status(200).json({
      body: 'some user info'
    });
  }`
);

fs.writeFileSync(
  '.output/server/pages/_middleware.js',
  `
    const getResult = (body, options) => ({
      promise: Promise.resolve(),
      waitUntil: Promise.resolve(),
      response: new Response(body, options),
    });

    _ENTRIES = typeof _ENTRIES === 'undefined' ? {} : _ENTRIES;

    _ENTRIES['middleware_pages/_middleware'] = {
      default: async function ({ request }) {

        return getResult('hi from the edge', {});

      },
    };
  `
);
