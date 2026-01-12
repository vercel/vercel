import { describe, expect, it } from 'vitest';
import didYouMean from '../../../src/util/did-you-mean';
import { commandNames } from '../../../src/commands';

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

describe('didYouMean for CLI commands', () => {
  it('should suggest "whoami" for "whoamai"', () => {
    expect(didYouMean('whoamai', commandNames, 0.7)).toEqual('whoami');
  });

  it('should suggest "deploy" for "deplo"', () => {
    expect(didYouMean('deplo', commandNames, 0.7)).toEqual('deploy');
  });

  it('should suggest "build" for "buld"', () => {
    expect(didYouMean('buld', commandNames, 0.7)).toEqual('build');
  });

  it('should suggest "login" for "logni"', () => {
    expect(didYouMean('logni', commandNames, 0.7)).toEqual('login');
  });

  it('should suggest "teams" for "temas"', () => {
    expect(didYouMean('temas', commandNames, 0.7)).toEqual('teams');
  });

  it('should not suggest anything for completely unrelated input', () => {
    expect(didYouMean('xyzabc', commandNames, 0.7)).toBeUndefined();
  });

  it('should not suggest anything for random string', () => {
    expect(didYouMean('asdfgh', commandNames, 0.7)).toBeUndefined();
  });
});
