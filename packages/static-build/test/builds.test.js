const path = require('path');
const fs = require('fs-extra');
const builder = require('../');
const { createRunBuildLambda } = require('../../../test/lib/run-build-lambda');

const runBuildLambda = createRunBuildLambda(builder);

const FOUR_MINUTES = 240000;

beforeAll(() => {
  process.env.VERCEL_ANALYTICS_ID = 'test';
});

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

    expect(require(path.join(workPath, 'gatsby-config.js')))
      .toMatchInlineSnapshot(`
      Object {
        "plugins": Array [
          "@vercel/gatsby-plugin-vercel-analytics"
        ],
      }
    `);
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

    expect(require(path.join(workPath, 'gatsby-config.js')))
      .toMatchInlineSnapshot(`
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

    expect(require(path.join(workPath, 'gatsby-config.js')))
      .toMatchInlineSnapshot(`
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

    expect(require(path.join(workPath, 'gatsby-config.js')))
      .toMatchInlineSnapshot(`
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

    expect(require(path.join(workPath, 'gatsby-config.js')))
      .toMatchInlineSnapshot(`
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

    expect(require(path.join(workPath, 'gatsby-config.js')))
      .toMatchInlineSnapshot(`
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

    expect(require(path.join(workPath, 'gatsby-config.js')))
      .toMatchInlineSnapshot(`
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

    expect(require(path.join(workPath, 'gatsby-config.ts')))
      .toMatchInlineSnapshot(`
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
    expect(await fs.readFile(path.join(workPath, 'gatsby-config.mjs'), 'utf-8'))
      .toBe(`import userConfig from "./gatsby-config.mjs.__vercel_builder_backup__.mjs";

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
  },
  FOUR_MINUTES
);
