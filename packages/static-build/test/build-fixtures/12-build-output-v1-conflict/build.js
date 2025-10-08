const fs = require('fs');

fs.mkdirSync('.vercel_build_output/static', { recursive: true });
fs.mkdirSync('.vercel_build_output/config', { recursive: true });

fs.writeFileSync(
  '.vercel_build_output/config/functions.json',
  JSON.stringify(
    {
      about: {
        memory: 3009,
      },
    },
    null,
    2
  )
);

fs.writeFileSync(
  '.vercel_build_output/static/index.html',
  '<h1>Build Output API v1</h1>'
);

fs.mkdirSync('.vercel_build_output/functions/node/about', { recursive: true });
fs.writeFileSync(
  '.vercel_build_output/functions/node/about/index.js',
  `export default function handler(request, response) {
    response.status(200).json({
      body: 'some user info'
    });
  }`
);

// .output looks like a Build Output API v2 build, but some frameworks (like Nuxt) use it
// for their own purposes
fs.mkdirSync('.output', { recursive: true });
fs.writeFileSync(
  '.output/nitro.json',
  JSON.stringify(
    {
      date: '2022-05-16T16:18:26.958Z',
      preset: 'server',
      commands: {
        preview: 'node ./server/index.mjs',
      },
    },
    null,
    2
  )
);
