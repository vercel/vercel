// Native
const { randomBytes } = require('crypto');
const { join, dirname } = require('path');

// Packages
const { imageSync: getImageFile } = require('qr-image');
const { mkdirp, writeFile } = require('fs-extra');

const getDockerFile = session => `
  FROM mhart/alpine-node:latest

  LABEL name "now-cli-dockerfile-${session}"

  RUN mkdir /app
  WORKDIR /app
  COPY package.json /app
  RUN yarn
  COPY index.js /app

  EXPOSE 3000
  CMD ["yarn", "start"]
`;

const getPackageFile = session => `
  {
    "name": "node-test-${session}",
    "main": "index.js",
    "license": "MIT",
    "scripts": {
      "start": "micro"
    },
    "dependencies": {
      "micro": "latest"
    }
  }
`;

const getIndexFile = session => `
  module.exports = () => ({
    id: '${session}'
  })
`;

const getConfigFile = builds =>
  builds
    ? `{
  "version": 2,
  "builds": [
    { "src": "*.html", "use": "@now/static" }
  ]
}`
    : `{
  "version": 1
}`;

const getIndexHTMLFile = session => `
<form action="/contact.php" method="POST">
  Post message for ${session} right here:
  <textarea name="Message" />
  <button>Submit</button>
</form>
`;

const getContactFile = session => `
<?php
if (empty($_ENV["AIRTABLE_KEY"])) {
  die("This is a test for ${session}");
}

http_request(
  "POST",
  "https://api.airtable.com/v0/appPkEQBBcdg0NIni/Messages",
  json_encode(array("fields" => $_POST)),
  array("headers" => array(
    "Authorization" => "Bearer " . $_ENV["AIRTABLE_KEY"],
    "Content-Type" => "application/json"
  ))
);
?>

<marquee>Thanks for your feedback!</marquee>
`;

const randomAliasSuffix = randomBytes(6).toString('hex');

const getRevertAliasConfigFile = () => {
  return JSON.stringify({
    version: 2,
    name: `now-revert-alias-${randomAliasSuffix}`,
    builds: [
      {
        src: '*.json',
        use: '@now/static',
      },
    ],
  });
};

module.exports = async session => {
  const files = {
    Dockerfile: getDockerFile(session),
    'index.js': getIndexFile(session),
    'package.json': getPackageFile(session),
    'now.json': getConfigFile(false),
    'first.png': getImageFile(session, {
      size: 30,
    }),
    'second.png': getImageFile(session, {
      size: 20,
    }),
    'now.json-builds': getConfigFile(true),
    'index.html': getIndexHTMLFile(session),
    'contact.php': getContactFile(session),
  };

  const spec = {
    dockerfile: ['index.js', 'Dockerfile', 'package.json', 'now.json'],
    node: ['index.js', 'package.json', 'now.json'],
    builds: ['index.html', 'now.json-builds'],
    'static-single-file': ['first.png', 'now.json'],
    'static-multiple-files': ['first.png', 'second.png', 'now.json'],
    'single-dotfile': {
      '.testing': 'i am a dotfile',
    },
    'empty-directory': {},
    'config-scope-property-email': {
      'now.json': `{ "scope": "${session}@zeit.pub", "builds": [ { "src": "*.html", "use": "@now/static" } ], "version": 2 }`,
      'index.html': '<span>test scope email</span',
    },
    'config-scope-property-username': {
      'now.json': `{ "scope": "${session}", "builds": [ { "src": "*.html", "use": "@now/static" } ] }`,
      'index.html': '<span>test scope username</span',
    },
    'builds-wrong': {
      'now.json': '{"builder": 1, "type": "static"}',
      'index.html': '<span>test</span',
    },
    'builds-wrong-vercel': {
      'vercel.json': '{"fake": 1}',
      'index.html': '<h1>Fake</h1>',
    },
    'builds-wrong-build-env': {
      'vercel.json': '{ "build.env": { "key": "value" } }',
      'index.html': '<h1>Should fail</h1>',
    },
    'builds-no-list': {
      'now.json': `{
  "version": 2,
  "routes": [
    {
      "src": "/(.*)",
      "status": 301,
      "headers": {
        "Location": "https://google.com"
      }
    }
  ]
}`,
    },
    'now-static-build': {
      'now.json': '{"version": 1, "type": "static"}',
      Dockerfile: `
FROM alpine
RUN mkdir /public
RUN echo hello > /public/index.html
      `,
    },
    'build-env-debug': {
      'now.json':
        '{ "builds": [ { "src": "index.js", "use": "@now/node" } ], "version": 2 }',
      'package.json': `
{
  "scripts": {
    "now-build": "node now-build.js"
  }
}
      `,
      'now-build.js': `
const fs = require('fs');
fs.writeFileSync(
  'index.js',
  fs
    .readFileSync('index.js', 'utf8')
    .replace('BUILD_ENV_DEBUG', process.env.NOW_BUILDER_DEBUG ? 'on' : 'off')
    .replace('BUILD_ENV_DEBUG', process.env.VERCEL_BUILDER_DEBUG ? 'on' : 'off'),
);
      `,
      'index.js': `
module.exports = (req, res) => {
  res.status(200).send('BUILD_ENV_DEBUG')
}
      `,
    },
    'now-revert-alias-1': {
      'index.json': JSON.stringify({ name: 'now-revert-alias-1' }),
      'now.json': getRevertAliasConfigFile(),
    },
    'now-revert-alias-2': {
      'index.json': JSON.stringify({ name: 'now-revert-alias-2' }),
      'now.json': getRevertAliasConfigFile(),
    },
    'now-dev-fail-dev-script': {
      'package.json': JSON.stringify(
        {
          scripts: {
            dev: 'now dev',
          },
        },
        null,
        2
      ),
    },
    'v1-warning-link': {
      'now.json': JSON.stringify({
        version: 1,
      }),
      'package.json': JSON.stringify({
        dependencies: {
          next: '9.0.0',
        },
      }),
    },
    'static-deployment': {
      'index.txt': 'Hello World',
    },
    nowignore: {
      'index.txt': 'Hello World',
      'ignore.txt': 'Should be ignored',
      '.nowignore': 'ignore.txt',
    },
    'nowignore-allowlist': {
      'index.txt': 'Hello World',
      'ignore.txt': 'Should be ignored',
      '.nowignore': '*\n!index.txt',
    },
    'failing-build': {
      'package.json': JSON.stringify({
        scripts: {
          build: 'echo hello && exit 1',
        },
      }),
    },
    'failing-alias': {
      'now.json': JSON.stringify(
        Object.assign(JSON.parse(getConfigFile(true)), { alias: 'vercel.com' })
      ),
    },
    'local-config-cloud-v1': {
      '.gitignore': '*.html',
      'index.js': `
const { createServer } = require('http');
const { readFileSync } = require('fs');
const svr = createServer((req, res) => {
  const { url = '/' } = req;
  const file = '.' + url;
  console.log('reading file ' + file);
  try {
    let contents = readFileSync(file, 'utf8');
    res.end(contents || '');
  } catch (e) {
    res.statusCode = 404;
    res.end('Not found');
  }
});
svr.listen(3000);`,
      'main.html': '<h1>hello main</h1>',
      'test.html': '<h1>hello test</h1>',
      'folder/file1.txt': 'file1',
      'folder/sub/file2.txt': 'file2',
      Dockerfile: `FROM mhart/alpine-node:latest
LABEL name "now-cli-dockerfile-${session}"

RUN mkdir /app
WORKDIR /app
COPY . /app
RUN yarn

EXPOSE 3000
CMD ["node", "index.js"]`,
      'now.json': JSON.stringify({
        version: 1,
        type: 'docker',
        features: {
          cloud: 'v1',
        },
        files: ['.gitignore', 'folder', 'index.js', 'main.html'],
      }),
      'now-test.json': JSON.stringify({
        version: 1,
        type: 'docker',
        features: {
          cloud: 'v1',
        },
        files: ['.gitignore', 'folder', 'index.js', 'test.html'],
      }),
    },
    'static-v2-meta': {
      'index.html': 'Static V2',
    },
    'redirects-v2': {
      'now.json': JSON.stringify({
        version: 2,
        name: 'redirects-v2',
        redirects: [{ source: `/(.*)`, destination: 'https://example.com/$1' }],
      }),
    },
    'deploy-with-only-readme-now-json': {
      'now.json': JSON.stringify({ version: 2 }),
      'README.md': 'readme contents',
    },
    'deploy-with-only-readme-vercel-json': {
      'vercel.json': JSON.stringify({ version: 2 }),
      'README.md': 'readme contents',
    },
    'local-config-v2': {
      [`main-${session}.html`]: '<h1>hello main</h1>',
      [`test-${session}.html`]: '<h1>hello test</h1>',
      'now.json': JSON.stringify({
        version: 2,
        name: 'original',
        builds: [{ src: `main-${session}.html`, use: '@now/static' }],
        routes: [{ src: '/another-main', dest: `/main-${session}.html` }],
      }),
      'now-test.json': JSON.stringify({
        version: 2,
        name: 'secondary',
        builds: [{ src: `test-${session}.html`, use: '@now/static' }],
        routes: [{ src: '/another-test', dest: `/test-${session}.html` }],
      }),
    },
    'local-config-above-target': {
      'now-root.json': JSON.stringify({
        version: 2,
        name: 'root-level',
      }),
      'dir/index.html': '<h1>hello index</h1>',
      'dir/another.html': '<h1>hello another</h1>',
      'dir/now.json': JSON.stringify({
        version: 2,
        name: 'nested-level',
      }),
    },
    'subdirectory-secret': {
      'index.html': 'Home page',
      'secret/file.txt': 'my secret',
    },
    'build-secret': {
      'package.json': JSON.stringify({
        private: true,
        scripts: {
          build: 'mkdir public && echo $MY_SECRET > public/index.txt',
        },
      }),
      'now.json': JSON.stringify({
        build: {
          env: {
            MY_SECRET: '@mysecret',
          },
        },
      }),
    },
    'api-env': {
      'api/get-env.js': 'module.exports = (_, res) => res.json(process.env)',
      'print.js': 'console.log(JSON.stringify(process.env))',
      'package.json': JSON.stringify({
        private: true,
        scripts: {
          build: 'mkdir public && node print.js > public/index.json',
        },
      }),
    },
    'alias-rules': {
      'rules.json': JSON.stringify({
        rules: [
          // for example:
          // { pathname: '/', dest: '' },
          // { pathname: '/', dest: '', method: 'GET' }
          // Will be generated by the actual test
        ],
      }),
      'invalid-rules.json': JSON.stringify({
        what: { what: 0 },
      }),
      'invalid-type-rules.json': JSON.stringify({
        rules: { what: 0 },
      }),
      'invalid-json-rules.json': '==ok',
    },
    'zero-config-next-js': {
      'pages/index.js':
        'export default () => <div><h1>Now CLI test</h1><p>Zero-config + Next.js</p></div>',
      'package.json': JSON.stringify({
        name: 'zero-config-next-js-test',
        scripts: {
          dev: 'next',
          start: 'next start',
          build: 'next build',
        },
        dependencies: {
          next: 'latest',
          react: 'latest',
          'react-dom': 'latest',
        },
      }),
    },
    'lambda-with-128-memory': {
      'api/memory.js': `
        module.exports = (req, res) => {
          res.json({ memory: parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE) });
        };
      `,
      'now.json': JSON.stringify({
        functions: {
          'api/**/*.js': {
            memory: 128,
          },
        },
      }),
    },
    'lambda-with-200-memory': {
      'api/memory.js': `
        module.exports = (req, res) => {
          res.json({ memory: parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE) });
        };
      `,
      'now.json': JSON.stringify({
        functions: {
          'api/**/*.js': {
            memory: 200,
          },
        },
      }),
    },
    'lambda-with-3-second-timeout': {
      'api/wait-for/[sleep].js': `
        const sleep = t => new Promise(r => setTimeout(r, t));

        module.exports = async (req, res) => {
          await sleep(parseInt(req.query.sleep || 1) * 1000);
          res.end('done');
        };
      `,
      'now.json': JSON.stringify({
        functions: {
          'api/**/*.js': {
            memory: 128,
            maxDuration: 3,
          },
        },
      }),
    },
    'lambda-with-1000-second-timeout': {
      'api/wait-for/[sleep].js': `
        const sleep = t => new Promise(r => setTimeout(r, t));

        module.exports = async (req, res) => {
          await sleep(parseInt(req.query.sleep || 1) * 1000);
          res.end('done');
        };
      `,
      'now.json': JSON.stringify({
        functions: {
          'api/**/*.js': {
            memory: 128,
            maxDuration: 1000,
          },
        },
      }),
    },
    'lambda-with-php-runtime': {
      'api/test.php': `<?php echo 'Hello from PHP'; ?>`,
      'now.json': JSON.stringify({
        functions: {
          'api/**/*.php': {
            runtime: 'vercel-php@0.1.0',
          },
        },
      }),
    },
    'lambda-with-invalid-runtime': {
      'api/test.php': `<?php echo 'Hello from PHP'; ?>`,
      'now.json': JSON.stringify({
        functions: {
          'api/**/*.php': {
            memory: 128,
            runtime: 'vercel-php@canary',
          },
        },
      }),
    },
    'github-and-scope-config': {
      'index.txt': 'I Am a Website!',
      'now.json': JSON.stringify({
        scope: 'i-do-not-exist',
        github: {
          autoAlias: true,
          autoJobCancelation: true,
          enabled: true,
          silent: true,
        },
      }),
    },
    'project-link': {
      'pages/index.js': 'export default () => <div><h1>Now CLI test</h1></div>',
      'package.json': JSON.stringify({
        dependencies: {
          gatsby: 'latest',
        },
      }),
    },
    'project-root-directory': {
      'src/index.html': '<h1>I am a website.</h1>',
      'src/now.json': JSON.stringify({
        rewrites: [
          {
            source: '/i-do-exist',
            destination: '/',
          },
        ],
      }),
    },
    'conflicting-now-json-vercel-json': {
      'index.html': '<h1>I am a website.</h1>',
      'vercel.json': getConfigFile(true),
      'now.json': getConfigFile(true),
    },
  };

  for (const typeName of Object.keys(spec)) {
    const needed = spec[typeName];
    const directory = join(
      __dirname,
      '..',
      'fixtures',
      'integration',
      typeName
    );
    await mkdirp(directory);

    if (Array.isArray(needed)) {
      // Get content from the defined files
      for (const name of needed) {
        const file = join(directory, name);
        const content = files[name];
        await mkdirp(dirname(file));
        await writeFile(file.replace('-builds', ''), content);
      }
    } else {
      // Get content from the object property
      const names = Object.keys(needed);
      for (const name of names) {
        const file = join(directory, name);
        const content = needed[name];
        await mkdirp(dirname(file));
        await writeFile(file.replace('-builds', ''), content);
      }
    }
  }
};
