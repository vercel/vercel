export const getDefaultConfig = async existingCopy => {
  let migrated = false;

  const config = {
    _:
      'This is your Vercel config file. For more information see the global configuration documentation: https://vercel.com/docs/configuration#global',
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
      'shownTips',
    ];

    try {
      const existing = Object.assign({}, existingCopy);
      const sh = Object.assign({}, existing.sh || {});

      Object.assign(config, existing, sh);

      for (const key of Object.keys(config)) {
        if (!keep.includes(key)) {
          delete config[key];
        }
      }

      if (typeof config.currentTeam === 'object') {
        config.currentTeam = config.currentTeam.id;
      }

      if (typeof config.user === 'object') {
        config.user = config.user.uid || config.user.id;
      }

      // Make sure Now Desktop users don't see any tips
      // again that they already dismissed
      if (config.shownTips) {
        if (config.desktop) {
          config.desktop.shownTips = config.shownTips;
        } else {
          config.desktop = {
            shownTips: config.shownTips,
          };
        }

        // Clean up the old property
        delete config.shownTips;
      }

      migrated = true;
    } catch (err) {}
  }

  return { config, migrated };
};

export const getDefaultAuthConfig = async existing => {
  let migrated = false;

  const config = {
    _:
      'This is your Vercel credentials file. DO NOT SHARE! More: https://vercel.com/docs/configuration#global',
  };

  if (existing) {
    try {
      const sh = existing.credentials.find(item => item.provider === 'sh');

      if (sh) {
        config.token = sh.token;
      }

      migrated = true;
    } catch (err) {}
  }

  return { config, migrated };
};
