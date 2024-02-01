module.exports = {
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
    };
  },
};
