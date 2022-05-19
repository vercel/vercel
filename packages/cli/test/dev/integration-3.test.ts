import { resolve, delimiter } from 'path';

const {
  fetch,
  sleep,
  fixture,
  isCanary,
  shouldSkip,
  testFixture,
  fetchWithRetry,
  testFixtureStdio,
  validateResponseHeaders,
} = require('./utils.js');

// Angular has `engines: { node: "10.x" }` in its `package.json`
test('[vercel dev] 02-angular-node', async () => {
  if (shouldSkip('02-angular-node', '10.x')) return;

  const directory = fixture('02-angular-node');
  const { dev, port } = await testFixture(directory, { stdio: 'pipe' }, [
    '--debug',
  ]);

  let stderr = '';

  try {
    dev.stderr.on('data', async (data: any) => {
      stderr += data.toString();
    });

    // start `vercel dev` detached in child_process
    dev.unref();

    const response = await fetchWithRetry(`http://localhost:${port}`, {
      retries: 180,
      status: 200,
    });

    validateResponseHeaders(response);

    const body = await response.text();
    expect(body).toMatch(/Angular \+ Node.js API/m);
  } finally {
    dev.kill('SIGTERM');
  }

  await sleep(5000);

  if (isCanary()) {
    stderr.includes('@now/build-utils@canary');
  } else {
    stderr.includes('@now/build-utils@latest');
  }
});

test(
  '[vercel dev] 03-aurelia',
  testFixtureStdio(
    '03-aurelia',
    async (testPath: any) => {
      await testPath(200, '/', /Aurelia Navigation Skeleton/m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 04-create-react-app',
  testFixtureStdio('04-create-react-app', async (testPath: any) => {
    await testPath(200, '/', /React App/m);
  })
);
/*
test(
  '[vercel dev] 05-gatsby',
  testFixtureStdio('05-gatsby', async (testPath: any) => {
    await testPath(200, '/', /Gatsby Default Starter/m);
  })
);
*/
test(
  '[vercel dev] 06-gridsome',
  testFixtureStdio('06-gridsome', async (testPath: any) => {
    await testPath(200, '/');
    await testPath(200, '/about');
    await testPath(308, '/support', 'Redirecting to /about?ref=support (308)', {
      Location: '/about?ref=support',
    });
    // Bug with gridsome's dev server: https://github.com/gridsome/gridsome/issues/831
    // Works in prod only so leave out for now
    // await testPath(404, '/nothing');
  })
);

test(
  '[vercel dev] 07-hexo-node',
  testFixtureStdio('07-hexo-node', async (testPath: any) => {
    await testPath(200, '/', /Hexo \+ Node.js API/m);
    await testPath(200, '/api/date', new RegExp(new Date().getFullYear() + ''));
    await testPath(200, '/contact.html', /Contact Us/m);
    await testPath(200, '/support', /Contact Us/m);
  })
);

test('[vercel dev] 08-hugo', async () => {
  if (process.platform === 'darwin') {
    // Update PATH to find the Hugo executable installed via GH Actions
    process.env.PATH = `${resolve(fixture('08-hugo'))}${delimiter}${
      process.env.PATH
    }`;
    const tester = testFixtureStdio('08-hugo', async (testPath: any) => {
      await testPath(200, '/', /Hugo/m);
    });
    await tester();
  } else {
    console.log(`Skipping 08-hugo on platform ${process.platform}`);
  }
});

test(
  '[vercel dev] 10-nextjs-node',
  testFixtureStdio('10-nextjs-node', async (testPath: any) => {
    await testPath(200, '/', /Next.js \+ Node.js API/m);
    await testPath(200, '/api/date', new RegExp(new Date().getFullYear() + ''));
    await testPath(200, '/contact', /Contact Page/);
    await testPath(200, '/support', /Contact Page/);
    // TODO: Fix this test assertion that fails intermittently
    // await testPath(404, '/nothing', /Custom Next 404/);
  })
);

test(
  '[vercel dev] 10a-nextjs-routes',
  testFixtureStdio('10a-nextjs-routes', async (testPath: any) => {
    await testPath(200, '/', /Next.js with routes/m);
    await testPath(200, '/hello', /Hello Routes/m);
  })
);

test(
  '[vercel dev] 12-polymer-node',
  testFixtureStdio(
    '12-polymer-node',
    async (testPath: any) => {
      await testPath(200, '/', /Polymer \+ Node.js API/m);
      await testPath(
        200,
        '/api/date',
        new RegExp(new Date().getFullYear() + '')
      );
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 13-preact-node',
  testFixtureStdio(
    '13-preact-node',
    async (testPath: any) => {
      await testPath(200, '/', /Preact/m);
      await testPath(
        200,
        '/api/date',
        new RegExp(new Date().getFullYear() + '')
      );
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 14-svelte-node',
  testFixtureStdio(
    '14-svelte-node',
    async (testPath: any) => {
      await testPath(200, '/', /Svelte/m);
      await testPath(
        200,
        '/api/date',
        new RegExp(new Date().getFullYear() + '')
      );
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 16-vue-node',
  testFixtureStdio(
    '16-vue-node',
    async (testPath: any) => {
      await testPath(200, '/', /Vue.js \+ Node.js API/m);
      await testPath(
        200,
        '/api/date',
        new RegExp(new Date().getFullYear() + '')
      );
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 17-vuepress-node',
  testFixtureStdio(
    '17-vuepress-node',
    async (testPath: any) => {
      await testPath(200, '/', /VuePress \+ Node.js API/m);
      await testPath(
        200,
        '/api/date',
        new RegExp(new Date().getFullYear() + '')
      );
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] double slashes redirect',
  testFixtureStdio(
    '01-node',
    async (_testPath: any, port: any) => {
      {
        const res = await fetch(`http://localhost:${port}////?foo=bar`, {
          redirect: 'manual',
        });

        validateResponseHeaders(res);

        const body = await res.text();
        expect(res.status).toBe(301);
        expect(res.headers.get('location')).toBe(
          `http://localhost:${port}/?foo=bar`
        );
        expect(body).toBe('Redirecting to /?foo=bar (301)\n');
      }

      {
        const res = await fetch(`http://localhost:${port}///api////date.js`, {
          method: 'POST',
          redirect: 'manual',
        });

        validateResponseHeaders(res);

        const body = await res.text();
        expect(res.status).toBe(200);
        expect(
          body.startsWith('January') ||
            body.startsWith('February') ||
            body.startsWith('March') ||
            body.startsWith('April') ||
            body.startsWith('May') ||
            body.startsWith('June') ||
            body.startsWith('July') ||
            body.startsWith('August') ||
            body.startsWith('September') ||
            body.startsWith('October') ||
            body.startsWith('November') ||
            body.startsWith('December')
        ).toBeTruthy();
      }
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 18-marko',
  testFixtureStdio(
    '18-marko',
    async (testPath: any) => {
      await testPath(200, '/', /Marko Starter/m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 19-mithril',
  testFixtureStdio(
    '19-mithril',
    async (testPath: any) => {
      await testPath(200, '/', /Mithril on Vercel/m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 20-riot',
  testFixtureStdio(
    '20-riot',
    async (testPath: any) => {
      await testPath(200, '/', /Riot on Vercel/m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 21-charge',
  testFixtureStdio(
    '21-charge',
    async (testPath: any) => {
      await testPath(200, '/', /Welcome to my new Charge site/m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 22-brunch',
  testFixtureStdio(
    '22-brunch',
    async (testPath: any) => {
      await testPath(200, '/', /Bon Appétit./m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 23-docusaurus',
  testFixtureStdio(
    '23-docusaurus',
    async (testPath: any) => {
      await testPath(200, '/', /My Site/m);
    },
    { skipDeploy: true }
  )
);

test('[vercel dev] 24-ember', async () => {
  if (shouldSkip('24-ember', '>^6.14.0 || ^8.10.0 || >=9.10.0')) return;

  const tester = testFixtureStdio(
    '24-ember',
    async (testPath: any) => {
      await testPath(200, '/', /HelloWorld/m);
    },
    { skipDeploy: true }
  );

  await tester();
});
