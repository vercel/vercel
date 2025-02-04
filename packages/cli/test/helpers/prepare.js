// Native
const { randomBytes } = require('crypto');
const { join, dirname } = require('path');

// Packages
const { imageSync: getImageFile } = require('qr-image');
const { mkdirp, writeFile } = require('fs-extra');

const randomAliasSuffix = randomBytes(6).toString('hex');

const getRevertAliasConfigFile = () => {
  return JSON.stringify({
    name: `now-revert-alias-${randomAliasSuffix}`,
    builds: [
      {
        src: '*.json',
        use: '@vercel/static',
      },
    ],
  });
};
module.exports = async function prepare(session, binaryPath, tmpFixturesDir) {
  const spec = {
    'static-single-file': {
      'first.png': getImageFile(session, { size: 30 }),
    },
    'static-multiple-files': {
      'first.png': getImageFile(session, { size: 30 }),
      'second.png': getImageFile(session, { size: 20 }),
    },
    'empty-directory': {},
    'config-scope-property-email': {
      'now.json': `{ "scope": "${session}@zeit.pub", "builds": [ { "src": "*.html", "use": "@vercel/static" } ] }`,
      'index.html': '<span>test scope email</span',
    },
    'config-scope-property-username': {
      'now.json': `{ "scope": "${session}", "builds": [ { "src": "*.html", "use": "@vercel/static" } ] }`,
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
    'builds-wrong-build-env': {
      'vercel.json': '{ "build.env": { "key": "value" } }',
      'index.html': '<h1>Should fail</h1>',
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
    'dev-fail-on-recursion-command': {
      'package.json': JSON.stringify({
        scripts: {
          build: 'echo "build script"',
        },
      }),
      'vercel.json': JSON.stringify({
        version: 2,
        devCommand: `${binaryPath} dev --token ${process.env.VERCEL_TOKEN} --scope ${process.env.VERCEL_TEAM_ID}`,
      }),
    },
    'build-fail-on-recursion-command': {
      'package.json': '{}',
    },
    'build-fail-on-recursion-script': {
      'package.json': JSON.stringify(
        {
          scripts: {
            build: `${binaryPath} build`,
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
      'now.json': JSON.stringify({ version: 2 }),
      'README.md': 'readme contents',
    },
    'deploy-with-only-readme-vercel-json': {
      'vercel.json': JSON.stringify({ version: 2 }),
      'README.md': 'readme contents',
    },
    'deploy-default-with-sub-directory': {
      'vercel.json': JSON.stringify({ version: 2 }),
      'output/README.md':
        'readme contents for deploy-default-with-sub-directory',
    },
    'deploy-default-with-conflicting-sub-directory': {
      'list/vercel.json': JSON.stringify({ version: 2 }),
      'list/list/README.md': 'nested nested readme contents',
      'list/README.md':
        'readme contents for deploy-default-with-conflicting-sub-directory',
    },
    'deploy-default-with-prebuilt-preview': {
      'vercel.json': JSON.stringify({ version: 2 }),
      '.vercel/output/builds.json': JSON.stringify({ target: 'preview' }),
      '.vercel/output/config.json': JSON.stringify({ version: 3 }),
      '.vercel/output/static/README.md':
        'readme contents for deploy-default-with-prebuilt-preview',
    },
    'build-output-api-raw': {
      'vercel.json': JSON.stringify({ version: 2 }),
      '.vercel/output/config.json': JSON.stringify({ version: 3 }),
      '.vercel/output/static/README.md':
        'readme contents for build-output-api-raw',
    },
    'local-config-v2': {
      [`main-${session}.html`]: '<h1>hello main</h1>',
      [`test-${session}.html`]: '<h1>hello test</h1>',
      'vercel.json': JSON.stringify({
        name: 'original',
        builds: [{ src: `main-${session}.html`, use: '@vercel/static' }],
        routes: [{ src: '/another-main', dest: `/main-${session}.html` }],
      }),
      'vercel-test.json': JSON.stringify({
        name: 'secondary',
        builds: [{ src: `test-${session}.html`, use: '@vercel/static' }],
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
          build: 'mkdir -p public && node print.js > public/index.json',
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
    'zero-config-next-js-functions-warning': {
      'pages/index.js':
        'export default () => <div><h1>Vercel CLI test</h1><p>Zero-config + Next.js</p></div>',
      'vercel.json':
        '{"version":2,"functions":{"pages/index.js":{"runtime": "@vercel/php@0.1.0"}}}',
      'package.json': JSON.stringify({
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
    'zero-config-next-js-nested': {
      'app/pages/index.js':
        'export default () => <div><h1>Now CLI test</h1><p>Zero-config + Next.js</p></div>',
      'app/package.json': JSON.stringify({
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
    'lambda-with-123-memory': {
      'api/memory.js': `
        module.exports = (req, res) => {
          res.json({ memory: parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE) });
        };
      `,
      'now.json': JSON.stringify({
        functions: {
          'api/**/*.js': {
            memory: 123,
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
      'package.json': JSON.stringify({
        engines: { node: '18.x' },
      }),
      'vercel.json': JSON.stringify({
        functions: {
          'api/**/*.php': {
            runtime: 'vercel-php@0.6.0',
          },
        },
      }),
    },
    'lambda-with-invalid-runtime': {
      'api/test.php': `<?php echo 'Hello from PHP'; ?>`,
      'vercel.json': JSON.stringify({
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
    'project-link-deploy': {
      'package.json': '{}',
    },
    'project-link-zeroconf': {
      'package.json': '{}',
    },
    'project-link-confirm': {
      'package.json': '{}',
    },
    'project-link-dev': {
      'package.json': '{}',
    },
    'project-link-gitignore': {
      'package.json': '{}',
      '.gitignore': '',
    },
    'project-link-legacy': {
      'index.html': 'Hello',
      'vercel.json': '{"builds":[{"src":"*.html","use":"@vercel/static"}]}',
    },
    'project-sensitive-env-vars': {
      'package.json': '{}',
    },
    'project-override-env-vars': {
      'package.json': '{}',
    },
    'dev-proxy-headers-and-env': {
      'package.json': JSON.stringify({}),
      'server.js': `require('http').createServer((req, res) => {
                      res.end(JSON.stringify({ headers: req.headers, env: process.env }));
                    }).listen(process.env.PORT);`,
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
      'vercel.json': JSON.stringify({
        builds: [{ src: '*.html', use: '@vercel/static' }],
      }),
      'now.json': JSON.stringify({
        builds: [{ src: '*.html', use: '@vercel/static' }],
      }),
    },
    'unauthorized-vercel-config': {
      // This project is under the testing-internal team
      '.vercel/project.json': JSON.stringify({
        orgId: 'team_JgimPl9u9uauL7E4MjMLt605',
        projectId: 'QmRoBYhejkkmssotLZr8tWgewPdPcjYucYUNERFbhJrRNi',
      }),
    },
    'vc-build-speed-insights': {
      '.vercel/project.json': JSON.stringify({
        orgId: '.',
        projectId: '.',
        settings: {
          framework: null,
        },
      }),
      'package.json': JSON.stringify({
        scripts: {
          build: 'mkdir -p public && echo hi > public/index.txt',
        },
        dependencies: {
          '@vercel/speed-insights': '0.0.4',
        },
      }),
    },
    'vc-build-indirect-web-analytics': {
      '.vercel/project.json': JSON.stringify({
        orgId: '.',
        projectId: '.',
        settings: {
          framework: null,
          installCommand: 'yarn add @vercel/analytics@1.1.1',
        },
      }),
      'package.json': JSON.stringify({
        scripts: {
          build: 'mkdir -p public && echo hi > public/index.txt',
        },
      }),
    },
    'vc-build-web-analytics': {
      '.vercel/project.json': JSON.stringify({
        orgId: '.',
        projectId: '.',
        settings: {
          framework: null,
        },
      }),
      'package.json': JSON.stringify({
        scripts: {
          build: 'mkdir -p public && echo hi > public/index.txt',
        },
        dependencies: {
          '@vercel/analytics': '1.0.0',
        },
      }),
    },
    'vc-build-static-build': {
      '.vercel/project.json': JSON.stringify({
        orgId: '.',
        projectId: '.',
        settings: {
          framework: null,
        },
      }),
      'package.json': JSON.stringify({
        scripts: {
          build: 'mkdir -p public && echo hi > public/index.txt',
        },
      }),
    },
    'vercel-json-configuration-overrides': {
      'vercel.json': '{}',
      'package.json': '{}',
    },
    'vercel-json-configuration-overrides-merging-prompts': {
      'vercel.json': JSON.stringify({
        buildCommand: 'mkdir -p output && echo "1" > output/index.txt',
      }),
      'package.json': '{}',
    },
    'vercel-json-configuration-overrides-link': {
      'vercel.json': JSON.stringify({
        buildCommand: 'mkdir public && echo "1" > public/index.txt',
      }),
    },
    'vc-build-corepack-npm': {
      '.vercel/project.json': JSON.stringify({
        orgId: '.',
        projectId: '.',
        settings: {
          framework: null,
        },
      }),
      'package.json': JSON.stringify({
        private: true,
        packageManager: 'npm@8.1.0',
        scripts: {
          build: 'mkdir -p public && npm --version > public/index.txt',
        },
      }),
    },
    'vc-build-corepack-pnpm': {
      '.vercel/project.json': JSON.stringify({
        orgId: '.',
        projectId: '.',
        settings: {
          framework: null,
        },
      }),
      'package.json': JSON.stringify({
        private: true,
        packageManager: 'pnpm@7.1.0',
        scripts: {
          build: 'mkdir -p public && pnpm --version > public/index.txt',
        },
      }),
    },
    'vc-build-corepack-yarn': {
      '.vercel/project.json': JSON.stringify({
        orgId: '.',
        projectId: '.',
        settings: {
          framework: null,
        },
      }),
      'package.json': JSON.stringify({
        private: true,
        packageManager: 'yarn@2.4.3',
        scripts: {
          build: 'mkdir -p public && yarn --version > public/index.txt',
        },
      }),
    },
    'static-build-dist-dir': {
      '.vercel/project.json': JSON.stringify({
        orgId: '.',
        projectId: '.',
        settings: {
          framework: null,
        },
      }),
      'vercel.json': JSON.stringify({
        version: 2,
        builds: [
          {
            src: 'package.json',
            use: '@vercel/static-build',
            config: { distDir: '.' },
          },
        ],
      }),
      'package.json': JSON.stringify({
        private: true,
        scripts: {
          build: 'echo "Hello, World!" >> index.txt',
        },
      }),
    },
    'static-build-zero-config-output-directory': {
      '.vercel/project.json': JSON.stringify({
        orgId: '.',
        projectId: '.',
        settings: {
          framework: null,
        },
      }),
      'vercel.json': JSON.stringify({
        version: 2,
        builds: [
          {
            src: 'package.json',
            use: '@vercel/static-build',
            config: { zeroConfig: true, outputDirectory: '.' },
          },
        ],
      }),
      'package.json': JSON.stringify({
        private: true,
        scripts: {
          build: 'echo "Hello, World!" >> index.txt',
        },
      }),
    },
  };

  for (const [typeName, needed] of Object.entries(spec)) {
    const directory = join(tmpFixturesDir, typeName);

    await mkdirp(directory);

    for (const [name, content] of Object.entries(needed)) {
      const file = join(directory, name);
      await mkdirp(dirname(file));
      await writeFile(file, content);
    }
  }
};
