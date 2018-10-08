import deploy from './latest';
import deployLegacy from './legacy';
import getContextName from '../../util/get-context-name';
import createOutput from '../../util/output';
import code from '../../util/output/code';
import highlight from '../../util/output/highlight';
import {readLocalConfig} from '../../util/config-files';

module.exports = async (ctx) => {
  const localConfig = readLocalConfig();

  let platformVersion = null;
  let contextName = null;

  const {authConfig, config: {currentTeam}, apiUrl} = ctx;
  const output = createOutput({ debug: false });
  const isHelp = ctx.argv[ctx.argv.length - 1] === '-h';

  if (authConfig && authConfig.token) {
    ({ contextName, platformVersion } = await getContextName({
      apiUrl,
      token: authConfig.token,
      debug: false,
      currentTeam,
      includePlatformVersion: true
    }));
  }

  if (!isHelp) {
    if (localConfig && localConfig.version) {
      const {version} = localConfig;

      if (typeof version === 'number') {
        if (version !== 1 && version !== 2) {
          const prop = code('version');
          const file = highlight('now.json');
          const first = code(1);
          const second = code(2);

          output.error(`The value of the ${prop} property inside ${file} can only be ${first} or ${second}.`);
          return 1;
        }

        platformVersion = version;
      } else {
        const prop = code('version');
        const file = highlight('now.json');

        output.error(`The ${prop} property inside your ${file} file must be a number.`);
        return 1;
      }
    } else {
      const prop = code('version');
      const file = highlight('now.json');
      const fallback = highlight(platformVersion === null ? 'latest version' : `version ${platformVersion}`);

      output.warn(`Your ${file} file is missing the ${prop} property. Falling back to ${fallback}.`);
    }
  }

  if (platformVersion === null || platformVersion > 1) {
    return deploy(ctx, contextName);
  }

  return deployLegacy(ctx, contextName);
}
