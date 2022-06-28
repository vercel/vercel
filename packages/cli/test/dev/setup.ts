import { URL } from 'url';
import { join } from 'path';
import fetch, { RequestInit, Response } from 'node-fetch';
import { afterAll, beforeAll, describe } from '@jest/globals';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface DescribeFixtureOptions {
  skipDeploy?: boolean;
}

export interface DescribeFixtureParams {
  url: string;
  fetch: (path: string, options?: RequestInit) => Promise<Response>;
}

export type DescribeFixtureFunction = (params: DescribeFixtureParams) => void;

export function describeFixture(
  name: string,
  fn: DescribeFixtureFunction,
  opts: DescribeFixtureOptions = {}
) {
  describe(`"${name}" fixture`, () => {
    let token: string;
    const fixtureDir = join(__dirname, 'fixtures', name);

    beforeAll(async () => {
      console.log('getting token');
      token = '';
      await sleep(1000);
      console.log('done getting token');
    });

    if (opts.skipDeploy !== true) {
      describe(`vercel deploy`, () => {
        let url: string;

        beforeAll(async () => {
          // Run `vc deploy`
          console.log('vc deploy');
          await sleep(1000);
          console.log('after vc deploy');
        });

        const params: DescribeFixtureParams = {
          get url() {
            return url;
          },
          fetch: (path, init) => {
            const reqUrl = new URL(path, url);
            return fetch(reqUrl, init);
          },
        };

        fn(params);
      });
    }

    describe(`vercel dev`, () => {
      let url: string;

      beforeAll(async () => {
        // Boot up `vc dev`
        console.log('vc dev');
        await sleep(1000);
        console.log('after vc dev');
      });

      afterAll(async () => {
        // Shut down `vc dev`
        console.log('shut down vc dev');
        await sleep(1000);
        console.log('shut down after vc dev');
      });

      const params: DescribeFixtureParams = {
        get url() {
          return url;
        },
        fetch: (path, init) => {
          const reqUrl = new URL(path, url);
          return fetch(reqUrl, init);
        },
      };

      fn(params);
    });
  });
}

describeFixture.skipDeploy = (name: string, fn: DescribeFixtureFunction) => {
  describeFixture(name, fn, { skipDeploy: true });
};
