// Native
const { randomBytes } = require('crypto');
const { join, dirname } = require('path');

// Packages
const { mkdirp, writeFile } = require('fs-extra');
const { imageSync: getImageFile } = require('qr-image');

const randomAliasSuffix = randomBytes(6).toString('hex');

const getRevertAliasConfigFile = () => {
  return JSON.stringify({
    name: `now-revert-alias-${randomAliasSuffix}`,
    builds: [
      {
        src: '*.json',
        use: '@now/static',
      },
    ],
  });
};

module.exports = async function prepare(session) {
  const spec = {
    'static-single-file': {
      'first.png': getImageFile(session, { size: 30 }),
    },
    'static-multiple-files': {
      'first.png': getImageFile(session, { size: 30 }),
      'second.png': getImageFile(session, { size: 20 }),
    },
    'single-dotfile': {
      '.testing': 'i am a dotfile',
    },
    'config-scope-property-email': {
      'now.json': `{ "scope": "${session}@zeit.pub", "builds": [ { "src": "*.html", "use": "@now/static" } ]}`,
      'index.html': '<span>test scope email</span',
    },
    'config-scope-property-username': {
      'now.json': `{ "scope": "${session}", "builds": [ { "src": "*.html", "use": "@now/static" } ] }`,
      'index.html': '<span>test scope username</span',
    },
    'builds-wrong': {
      'now.json': JSON.stringify({ builder: 1 }),
      'index.html': '<span>test</span',
    },
    'builds-wrong-vercel': {
      'vercel.json': '{"fake": 1}',
      'index.html': '<h1>Fake</h1>',
    },
    'builds-no-list': {
      'now.json': JSON.stringify({
        routes: [
          {
            src: '/(.*)',
            status: 301,
            headers: {
              Location: 'https://google.com',
            },
          },
        ],
      }),
    },
    'build-env': {
      'now.json': JSON.stringify({
        build: {
          env: {
            FOO: 'bar',
          },
        },
      }),
      'package.json': JSON.stringify({
        scripts: {
          build: 'mkdir -p public && echo $FOO > public/index.txt',
        },
      }),
    },
    'build-env-arg': {
      'package.json': JSON.stringify({
        scripts: {
          build: 'mkdir -p public && echo $NONCE > public/index.txt',
        },
      }),
    },
    'build-env-debug': {
      'now.json': JSON.stringify({
        builds: [{ src: 'index.js', use: '@now/node' }],
      }),
      'package.json': JSON.stringify({
        scripts: {
          'now-build': 'node now-build.js',
        },
      }),
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
      'index.js': `module.exports = (req, res) => { res.status(200).send('BUILD_ENV_DEBUG'); }`,
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
    'static-v2-meta': {
      'index.html': 'Static V2',
    },
    'redirects-v2': {
      'now.json': JSON.stringify({
        name: 'redirects-v2',
        redirects: [{ source: `/(.*)`, destination: 'https://example.com/$1' }],
      }),
    },
    'deploy-with-only-readme-now-json': {
      'README.md': 'readme contents',
    },
    'deploy-with-only-readme-vercel-json': {
      'README.md': 'readme contents',
    },
    'local-config-v2': {
      [`main-${session}.html`]: '<h1>hello main</h1>',
      [`test-${session}.html`]: '<h1>hello test</h1>',
      'now.json': JSON.stringify({
        name: 'original',
        builds: [{ src: `main-${session}.html`, use: '@now/static' }],
        routes: [{ src: '/another-main', dest: `/main-${session}.html` }],
      }),
      'now-test.json': JSON.stringify({
        name: 'secondary',
        builds: [{ src: `test-${session}.html`, use: '@now/static' }],
        routes: [{ src: '/another-test', dest: `/test-${session}.html` }],
      }),
    },
    'local-config-above-target': {
      'now-root.json': JSON.stringify({
        name: 'root-level',
      }),
      'dir/index.html': '<h1>hello index</h1>',
      'dir/another.html': '<h1>hello another</h1>',
      'dir/now.json': JSON.stringify({
        name: 'nested-level',
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
    'context-website': {
      'index.txt': session,
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
            runtime: 'now-php@0.0.8',
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
            runtime: 'now-php@canary',
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
      'vercel.json': {
        builds: [{ src: '*.html', use: '@now/static' }],
      },
      'now.json': {
        builds: [{ src: '*.html', use: '@now/static' }],
      },
    },
  };

  for (const [typeName, needed] of Object.entries(spec)) {
    const directory = join(
      __dirname,
      '..',
      'fixtures',
      'integration',
      typeName
    );

    await mkdirp(directory);

    for (const [name, content] of Object.entries(needed)) {
      const file = join(directory, name);
      await mkdirp(dirname(file));
      await writeFile(file.replace('-builds', ''), content);
    }
  }
};
