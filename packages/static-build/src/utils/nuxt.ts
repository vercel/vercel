import { join } from 'path';
import { update } from 'rc9';
import { PackageJson } from '@vercel/build-utils';
import { DeepWriteable, readPackageJson, writePackageJson } from './_shared';

// https://github.com/nuxt-modules/web-vitals
const ANALYTICS_PLUGIN_PACKAGE = '@nuxtjs/web-vitals';

export async function injectVercelAnalyticsPlugin(dir: string) {
  // First update the `.nuxtrc` file to inject the analytics plugin.
  // See: https://gist.github.com/pi0/23b5253ac19b4ed5a70add3b971545c9
  const nuxtrcPath = join(dir, '.nuxtrc');
  console.log(
    `Injecting Nuxt.js analytics plugin "${ANALYTICS_PLUGIN_PACKAGE}" to \`${nuxtrcPath}\``
  );
  update(
    {
      'modules[]': ANALYTICS_PLUGIN_PACKAGE,
    },
    {
      name: nuxtrcPath,
    }
  );

  // The dependency needs to be listed in `package.json` as well so
  // that `npm i` installs the package.
  const pkgJson: DeepWriteable<PackageJson> = (await readPackageJson(
    dir
  )) as DeepWriteable<PackageJson>;
  if (!pkgJson.dependencies) {
    pkgJson.dependencies = {};
  }
  if (!pkgJson.dependencies[ANALYTICS_PLUGIN_PACKAGE]) {
    pkgJson.dependencies[ANALYTICS_PLUGIN_PACKAGE] = 'latest';
    console.log(
      `Adding "${ANALYTICS_PLUGIN_PACKAGE}" to \`package.json\` "dependencies"`
    );
    await writePackageJson(dir, pkgJson);
  }
}
