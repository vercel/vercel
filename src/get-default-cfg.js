module.exports = async (existingCopy) => {
  let migrated = false

  const config = {
    _: 'This is your Now config file. See `now config help`. More: https://goo.gl/5aRS2s'
  }

  if (existingCopy) {
    const keep = [
      '_',
      'user',
      'currentTeam',
      'desktop',
      'updateChannel',
      'api',
      'shownTips'
    ]

    try {
      const existing = Object.assign({}, existingCopy);
      const sh = Object.assign({}, existing.sh || {});

      Object.assign(config, existing, sh);

      for (const key of Object.keys(config)) {
        if (!keep.includes(key)) {
          delete config[key]
        }
      }

      if (typeof config.currentTeam === 'object') {
        config.currentTeam = config.currentTeam.id
      }

      if (typeof config.user === 'object') {
        config.user = config.user.uid || config.user.id
      }

      // Make sure Now Desktop users don't see any tips
      // again that they already dismissed
      if (config.shownTips) {
        if (config.desktop) {
          config.desktop.shownTips = config.shownTips
        } else {
          config.desktop = {
            shownTips: config.shownTips
          }
        }

        // Clean up the old property
        delete config.shownTips
      }

      migrated = true
    } catch (err) {}
  }

  return {config, migrated}
}
