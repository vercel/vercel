module.exports = {
  generateBuildId() {
    return 'build-TfctsWXpff2fKS';
  },
  async rewrites() {
    return [
      {
        source: '/:path*',
        destination: '/params',
      },
    ];
  },
};
