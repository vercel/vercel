module.exports = {
  generateBuildId() {
    return 'build-TfctsWXpff2fKS';
  },
  rewrites() {
    return [
      {
        source: '/:path*',
        destination: '/ebay/:path*',
      },
    ];
  },
};
