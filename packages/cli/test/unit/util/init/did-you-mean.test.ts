import didYouMean from '../../../../src/util/init/did-you-mean';

describe('didYouMean', () => {
  const examples = [
    'apollo',
    'create-react-app',
    'docz',
    'gatsby',
    'go',
    'gridsome',
    'html-minifier',
    'mdx-deck',
    'monorepo',
    'nextjs',
    'nextjs-news',
    'nextjs-static',
    'node-server',
    'nodejs',
    'nodejs-canvas-partyparrot',
    'nodejs-coffee',
    'nodejs-express',
    'nodejs-hapi',
    'nodejs-koa',
    'nodejs-koa-ts',
    'nodejs-pdfkit',
    'nuxt-static',
    'optipng',
    'php-7',
    'puppeteer-screenshot',
    'python',
    'redirect',
    'serverless-ssr-reddit',
    'static',
    'vue',
    'vue-ssr',
    'vuepress',
  ];

  it('should guess "mdx-deck"', () => {
    expect(didYouMean('md', examples, 0.7)).toEqual('mdx-deck');
  });

  it('should guess "nodejs-koa"', () => {
    expect(didYouMean('koa', examples, 0.7)).toEqual('nodejs-koa');
  });

  it('should guess "nodejs"', () => {
    expect(didYouMean('node', examples, 0.7)).toEqual('nodejs');
  });

  it('should fail to guess with bad input', () => {
    expect(didYouMean('12345', examples, 0.7)).toBeUndefined();
  });
});
