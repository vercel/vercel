module.exports = {
  poweredByHeader: false,

  webpack: (config, { defaultLoaders }) => {
    defaultLoaders.babel.options.rootMode = 'upward';
    return config;
  },
};
