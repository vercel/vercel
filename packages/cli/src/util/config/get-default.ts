import { AuthConfig, GlobalConfig } from '../../types';

export const getDefaultConfig = async (existingCopy?: GlobalConfig | null) => {
  let migrated = false;

  const config: GlobalConfig = {
    _: 'This is your Vercel config file. For more information see the global configuration documentation: https://vercel.com/docs/configuration#global',
    collectMetrics: true,
  };

  if (existingCopy) {
    const keep = [
      '_',
      'currentTeam',
      'desktop',
      'updateChannel',
      'collectMetrics',
      'api',
      // This is deleted later in the code
    ];

    try {
      const existing = Object.assign({}, existingCopy);
      // @ts-ignore
      const sh = Object.assign({}, existing.sh || {});

      Object.assign(config, existing, sh);

      for (const key of Object.keys(config)) {
        if (!keep.includes(key)) {
          // @ts-ignore
          delete config[key];
        }
      }

      if (typeof config.currentTeam === 'object') {
        // @ts-ignore
        config.currentTeam = config.currentTeam.id;
      }

      // @ts-ignore
      if (typeof config.user === 'object') {
        // @ts-ignore
        config.user = config.user.uid || config.user.id;
      }

      migrated = true;
    } catch (err) {}
  }

  return { config, migrated };
};

export const getDefaultAuthConfig = async (existing?: AuthConfig | null) => {
  let migrated = false;

  const config: AuthConfig = {
    _: 'This is your Vercel credentials file. DO NOT SHARE! More: https://vercel.com/docs/configuration#global',
  };

  if (existing) {
    try {
      // @ts-ignore
      const sh = existing.credentials.find(item => item.provider === 'sh');

      if (sh) {
        config.token = sh.token;
      }

      migrated = true;
    } catch (err) {}
  }

  return { config, migrated };
};
