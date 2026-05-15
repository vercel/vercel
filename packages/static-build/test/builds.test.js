const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const builder = require('../');
const { createRunBuildLambda } = require('../../../test/lib/run-build-lambda');

const runBuildLambda = createRunBuildLambda(builder);

const FOUR_MINUTES = 240000;

const warnSpy = vi.spyOn(console, 'warn');

beforeAll(() => {
  process.env.VERCEL_ANALYTICS_ID = 'test';
});

beforeEach(() => vi.clearAllMocks());

it(
  'Should build Gatsby without any configuration',
  async () => {
    const { workPath } = await runBuildLambda(
      path.join(__dirname, 'build-fixtures/01-gatsby-default')
    );

    const contents = await fs.readdir(workPath);

    expect(contents.some(name => name === 'gatsby-config.js')).toBeTruthy();
    expect(
      contents.some(
        name => name === 'gatsby-config.js.__vercel_builder_backup__.js'
      )
    ).toBeFalsy();

    expect(
      require(path.join(workPath, 'gatsby-config.js'))
    ).toMatchInlineSnapshot(`
      Object {
        "plugins": Array [
          "@vercel/gatsby-plugin-vercel-analytics"
        ],
      }
    `);
    expect(warnSpy).toHaveBeenCalledWith(
      'Vercel Speed Insights auto-injection is deprecated in favor of @vercel/speed-insights package. Learn more: https://vercel.link/upgrate-to-speed-insights-package'
    );
  },
  FOUR_MINUTES
);

it(
  'Should build Gatsby with configuration but no plugins',
  async () => {
    const { workPath } = await runBuildLambda(
      path.join(__dirname, 'build-fixtures/02-gatsby-user-config')
    );

    const contents = await fs.readdir(workPath);

    expect(contents.some(name => name === 'gatsby-config.js')).toBeTruthy();
    expect(
      contents.some(
        name => name === 'gatsby-config.js.__vercel_builder_backup__.js'
      )
    ).toBeTruthy();

    expect(
      require(path.join(workPath, 'gatsby-config.js'))
    ).toMatchInlineSnapshot(`
      Object {
        "plugins": Array [
          "@vercel/gatsby-plugin-vercel-analytics"
        ],
        "siteMetadata": Object {
          "author": "@gatsbyjs",
          "description": "Kick off your next, great Gatsby project with this default starter. This barebones starter ships with the main Gatsby configuration files you might need.",
          "title": "Gatsby Default Starter",
        },
      }
    `);
  },
  FOUR_MINUTES
);

it(
  'Should build Gatsby with configuration that has plugins',
  async () => {
    const { workPath } = await runBuildLambda(
      path.join(__dirname, 'build-fixtures/03-gatsby-with-plugins')
    );

    const contents = await fs.readdir(workPath);

    expect(contents.some(name => name === 'gatsby-config.js')).toBeTruthy();
    expect(
      contents.some(
        name => name === 'gatsby-config.js.__vercel_builder_backup__.js'
      )
    ).toBeTruthy();

    expect(
      require(path.join(workPath, 'gatsby-config.js'))
    ).toMatchInlineSnapshot(`
      Object {
        "plugins": Array [
          "gatsby-plugin-react-helmet",
          "@vercel/gatsby-plugin-vercel-analytics"
        ],
        "siteMetadata": Object {
          "author": "@gatsbyjs",
          "description": "Kick off your next, great Gatsby project with this default starter. This barebones starter ships with the main Gatsby configuration files you might need.",
          "title": "Gatsby Default Starter",
        },
      }
    `);
  },
  FOUR_MINUTES
);

it(
  'Should build Gatsby with configuration that already has plugin (simple)',
  async () => {
    const { workPath } = await runBuildLambda(
      path.join(__dirname, 'build-fixtures/04-gatsby-no-dupe-simple')
    );

    const contents = await fs.readdir(workPath);

    expect(contents.some(name => name === 'gatsby-config.js')).toBeTruthy();
    expect(
      contents.some(
        name => name === 'gatsby-config.js.__vercel_builder_backup__.js'
      )
    ).toBeTruthy();

    expect(
      require(path.join(workPath, 'gatsby-config.js'))
    ).toMatchInlineSnapshot(`
      Object {
        "plugins": Array [
          "@vercel/gatsby-plugin-vercel-analytics",
        ],
        "siteMetadata": Object {
          "author": "@gatsbyjs",
          "description": "Kick off your next, great Gatsby project with this default starter. This barebones starter ships with the main Gatsby configuration files you might need.",
          "title": "Gatsby Default Starter",
        },
      }
    `);
  },
  FOUR_MINUTES
);

it(
  'Should build Gatsby with configuration that already has plugin (advanced)',
  async () => {
    const { workPath } = await runBuildLambda(
      path.join(__dirname, 'build-fixtures/05-gatsby-no-dupe-advanced')
    );

    const contents = await fs.readdir(workPath);

    expect(contents.some(name => name === 'gatsby-config.js')).toBeTruthy();
    expect(
      contents.some(
        name => name === 'gatsby-config.js.__vercel_builder_backup__.js'
      )
    ).toBeTruthy();

    expect(
      require(path.join(workPath, 'gatsby-config.js'))
    ).toMatchInlineSnapshot(`
      Object {
        "plugins": Array [
          Object {
            "options": Object {},
            "resolve": "@vercel/gatsby-plugin-vercel-analytics",
          },
        ],
        "siteMetadata": Object {
          "author": "@gatsbyjs",
          "description": "Kick off your next, great Gatsby project with this default starter. This barebones starter ships with the main Gatsby configuration files you might need.",
          "title": "Gatsby Default Starter",
        },
      }
    `);
  },
  FOUR_MINUTES
);

it(
  'Should build Gatsby with configuration that has export default',
  async () => {
    const { workPath } = await runBuildLambda(
      path.join(__dirname, 'build-fixtures/06-gatsby-export-default')
    );

    const contents = await fs.readdir(workPath);

    expect(contents.some(name => name === 'gatsby-config.js')).toBeTruthy();
    expect(
      contents.some(
        name => name === 'gatsby-config.js.__vercel_builder_backup__.js'
      )
    ).toBeTruthy();

    expect(
      require(path.join(workPath, 'gatsby-config.js'))
    ).toMatchInlineSnapshot(`
      Object {
        "plugins": Array [
          "gatsby-plugin-react-helmet",
          "@vercel/gatsby-plugin-vercel-analytics"
        ],
        "siteMetadata": Object {
          "author": "@gatsbyjs",
          "description": "Kick off your next, great Gatsby project with this default starter. This barebones starter ships with the main Gatsby configuration files you might need.",
          "title": "Gatsby Default Starter",
        },
      }
    `);
  },
  FOUR_MINUTES
);

it(
  'Should build Gatsby with "gatsby-plugin-zeit-now" plugin',
  async () => {
    const { workPath } = await runBuildLambda(
      path.join(__dirname, 'build-fixtures/07-gatsby-with-now-plugin')
    );

    const contents = await fs.readdir(workPath);

    expect(contents.some(name => name === 'gatsby-config.js')).toBeTruthy();

    expect(
      require(path.join(workPath, 'gatsby-config.js'))
    ).toMatchInlineSnapshot(`
      Object {
        "plugins": Array [
          Object {
            "options": Object {
              "globalHeaders": Object {
                "x-some-header": "some-value",
              },
            },
            "resolve": "gatsby-plugin-zeit-now",
          },
          "@vercel/gatsby-plugin-vercel-analytics"
        ],
        "siteMetadata": Object {
          "author": "@gatsbyjs",
          "description": "Kick off your next, great Gatsby project with this default starter. This barebones starter ships with the main Gatsby configuration files you might need.",
          "title": "Gatsby Default Starter",
        },
      }
    `);
  },
  FOUR_MINUTES
);

it(
  'Should build Gatsby with configuration defined in typescript',
  async () => {
    const { workPath } = await runBuildLambda(
      path.join(__dirname, 'build-fixtures/13-gatsby-with-typescript-config')
    );

    const contents = await fs.readdir(workPath);

    expect(contents.some(name => name === 'gatsby-config.js')).toBeFalsy();
    expect(contents.some(name => name === 'gatsby-config.ts')).toBeTruthy();

    expect(
      require(path.join(workPath, 'gatsby-config.ts'))
    ).toMatchInlineSnapshot(`
      Object {
        "default": Object {
          "plugins": Array [
            "@vercel/gatsby-plugin-vercel-builder",
            "@vercel/gatsby-plugin-vercel-analytics",
          ],
          "siteMetadata": Object {
            "siteUrl": "https://gatsby-typescript-config.vercel.app",
            "title": "Gatsby Typescript Config",
          },
        },
      }
    `);
  },
  FOUR_MINUTES
);

it(
  'Should build Gatsby with configuration defined in esm',
  async () => {
    const { workPath } = await runBuildLambda(
      path.join(__dirname, 'build-fixtures/14-gatsby-with-esm-config')
    );

    const contents = await fs.readdir(workPath);

    expect(contents.some(name => name === 'gatsby-config.js')).toBeFalsy();
    expect(contents.some(name => name === 'gatsby-config.ts')).toBeFalsy();
    expect(contents.some(name => name === 'gatsby-config.mjs')).toBeTruthy();
    // using `import` causes a seg fault.
    expect(
      await fs.readFile(path.join(workPath, 'gatsby-config.mjs'), 'utf-8')
    ).toBe(`import userConfig from "./gatsby-config.mjs.__vercel_builder_backup__.mjs";

// https://github.com/gatsbyjs/gatsby/blob/354003fb2908e02ff12109ca3a02978a5a6e608c/packages/gatsby/src/bootstrap/prefer-default.ts
const preferDefault = (m) => (m && m.default) || m;

const vercelConfig = Object.assign(
  {},
  // https://github.com/gatsbyjs/gatsby/blob/a6ecfb2b01d761e8a3612b8ea132c698659923d9/packages/gatsby/src/services/initialize.ts#L113-L117
  preferDefault(userConfig)
);
if (!vercelConfig.plugins) {
  vercelConfig.plugins = [];
}

for (const plugin of ["@vercel/gatsby-plugin-vercel-builder","@vercel/gatsby-plugin-vercel-analytics"]) {
  const hasPlugin = vercelConfig.plugins.find(
    (p) => p && (p === plugin || p.resolve === plugin)
  );

  if (!hasPlugin) {
    vercelConfig.plugins = vercelConfig.plugins.slice();
    vercelConfig.plugins.push(plugin);
  }
}

export default vercelConfig;
`);
  },
  FOUR_MINUTES
);

describe('when @vercel/speed-insights is present', () => {
  it(
    'Should build Gatsby without the "@vercel/gatsby-plugin-vercel-analytics" plugin',
    async () => {
      const { workPath } = await runBuildLambda(
        path.join(
          __dirname,
          'build-fixtures/15-gatsby-default-with-speed-insights-package'
        )
      );

      const contents = await fs.readdir(workPath);

      expect(contents.some(name => name === 'gatsby-config.js')).toBeTruthy();

      expect(
        require(path.join(workPath, 'gatsby-config.js'))
      ).toMatchInlineSnapshot(`
      Object {
        "plugins": Array [],
      }
    `);

      expect(warnSpy).not.toHaveBeenCalledWith(
        'Vercel Speed Insights auto-injection is deprecated in favor of @vercel/speed-insights package. Learn more: https://vercel.link/upgrate-to-speed-insights-package'
      );
    },
    FOUR_MINUTES
  );

  it(
    'Should build Nuxt.js without the "@nuxtjs/web-vitals" plugin',
    async () => {
      const fixture = path.join(
        __dirname,
        'build-fixtures/16-nuxtjs-default-with-speed-insights-package'
      );
      const { workPath } = await runBuildLambda(fixture);

      // The `.nuxtrc` file should not contain the plugin in `modules[]`
      const rc = await fs.readFile(path.join(workPath, '.nuxtrc'), 'utf8');
      expect(rc.includes('modules[]=@nuxtjs/web-vitals')).toBeFalsy();

      // The `package.json` file should not have the plugin listed as a dependency
      const pkg = require(path.join(workPath, 'package.json'));
      expect(pkg.dependencies['@nuxtjs/web-vitals']).toBe(undefined);

      expect(warnSpy).not.toHaveBeenCalledWith(
        'Vercel Speed Insights auto-injection is deprecated in favor of @vercel/speed-insights package. Learn more: https://vercel.link/upgrate-to-speed-insights-package'
      );
    },
    FOUR_MINUTES
  );
});

it(
  'Should build Nuxt.js with "@nuxtjs/web-vitals" plugin',
  async () => {
    const fixture = path.join(__dirname, 'build-fixtures/08-nuxtjs-default');
    const { workPath } = await runBuildLambda(fixture);

    // The `.nuxtrc` file should contain the plugin in `modules[]`
    const rc = await fs.readFile(path.join(workPath, '.nuxtrc'), 'utf8');
    expect(rc.includes('modules[]=@nuxtjs/web-vitals')).toBeTruthy();

    // The `package.json` file should have the plugin listed as a dependency
    const pkg = require(path.join(workPath, 'package.json'));
    expect(pkg.dependencies['@nuxtjs/web-vitals']).toBe('latest');

    expect(warnSpy).toHaveBeenCalledWith(
      'Vercel Speed Insights auto-injection is deprecated in favor of @vercel/speed-insights package. Learn more: https://vercel.link/upgrate-to-speed-insights-package'
    );
  },
  FOUR_MINUTES
);

it(
  'Should use Nitro fallback build command for TanStack Start when experimental env is enabled',
  async () => {
    const fixture = path.join(
      __dirname,
      'build-fixtures/17-tanstack-start-nitro-fallback'
    );
    const workFixture = await fs.mkdtemp(
      path.join(os.tmpdir(), 'vercel-static-build-tanstack-fixture-')
    );
    const shimDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'vercel-static-build-bin-shim-')
    );
    const npmPath = path.join(shimDir, 'npm');
    const previousPath = process.env.PATH;
    const previousInjectNitro = process.env.VERCEL_EXPERIMENTAL_INJECT_NITRO;

    await fs.copy(fixture, workFixture);
    const nitroBinDir = path.join(workFixture, 'node_modules', '.bin');
    await fs.mkdirp(nitroBinDir);
    await fs.writeFile(
      path.join(nitroBinDir, 'nitro'),
      [
        '#!/bin/sh',
        'if [ "$1" = "build" ] && [ "$2" = "--builder" ] && [ "$3" = "vite" ]; then',
        '  mkdir -p dist',
        '  echo "<html>nitro-fallback</html>" > dist/index.html',
        '  exit 0',
        'fi',
        'echo "unexpected nitro args: $@" >&2',
        'exit 1',
        '',
      ].join('\n')
    );
    await fs.writeFile(
      npmPath,
      [
        '#!/bin/sh',
        'if [ "$1" = "install" ] && [ "$2" = "--no-save" ] && [ "$3" = "nitro@npm:nitro-nightly@latest" ]; then',
        '  exit 0',
        'fi',
        'echo "unexpected npm args: $@" >&2',
        'exit 1',
        '',
      ].join('\n')
    );
    await fs.chmod(path.join(nitroBinDir, 'nitro'), 0o755);
    await fs.chmod(npmPath, 0o755);

    process.env.PATH = `${shimDir}${path.delimiter}${previousPath || ''}`;
    process.env.VERCEL_EXPERIMENTAL_INJECT_NITRO = '1';

    try {
      const { buildResult } = await runBuildLambda(workFixture);

      expect(buildResult.output['index.html']).toBeTruthy();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          './node_modules/.bin/nitro build --builder vite'
        )
      );
    } finally {
      process.env.PATH = previousPath;
      if (previousInjectNitro === undefined) {
        delete process.env.VERCEL_EXPERIMENTAL_INJECT_NITRO;
      } else {
        process.env.VERCEL_EXPERIMENTAL_INJECT_NITRO = previousInjectNitro;
      }
      await fs.remove(shimDir);
      await fs.remove(workFixture);
    }
  },
  FOUR_MINUTES
);
