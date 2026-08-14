module.exports = {
  generateBuildId() {
    return 'build-TfctsWXpff2fKS';
  },
  rewrites() {
    return {
      fallback: [
        {
          source: '/blog/:path',
          destination: '/hello.txt',
        },
      ],
    };
  },
};
