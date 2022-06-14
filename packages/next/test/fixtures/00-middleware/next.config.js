module.exports = {
  generateBuildId() {
    return 'testing-build-id';
  },
  redirects() {
    return [
      {
        source: '/redirect-me',
        destination: '/from-next-config',
        permanent: false,
      },
    ];
  },
  rewrites() {
    return {
      beforeFiles: [
        {
          source: '/rewrite-before-files',
          destination: '/somewhere',
        },
      ],
      afterFiles: [
        {
          source: '/after-file-rewrite',
          destination: '/about',
        },
      ],
    };
  },
};
