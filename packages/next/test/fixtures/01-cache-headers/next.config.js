module.exports = {
  async headers() {
    return [
      {
        source: '/_next/static/build-TfctsWXpff2fKS/_buildManifest.js',
        headers: [
          {
            key: 'cache-control',
            value: 'no-cache',
          },
        ],
      },
    ];
  },
  generateBuildId() {
    return 'build-TfctsWXpff2fKS';
  },
};
