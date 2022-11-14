const fs = require('fs');

fs.mkdirSync('.vercel_build_output/static', { recursive: true });
fs.mkdirSync('.vercel_build_output/config', { recursive: true });

fs.writeFileSync(
  '.vercel_build_output/config/functions.json',
  JSON.stringify(
    {
      about: {
        memory: 3008,
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
