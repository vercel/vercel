const nextConfig = {
  rewrites: async () => {
    return [
      {
        source: '/:lang(en|fi|sv|fr|nb)',
        destination: '/:lang/landing',
      },
    ];
  },
};

module.exports = nextConfig;
