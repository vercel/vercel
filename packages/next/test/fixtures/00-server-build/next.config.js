module.exports = {
  generateBuildId() {
    return 'build-TfctsWXpff2fKS';
  },
  experimental: {
    nftTracing: true,
  },
  redirects() {
    return [
      {
        source: '/build-time-not-found/:path*',
        destination: '/somewhere-else',
        permanent: false,
      },
    ];
  },
};
