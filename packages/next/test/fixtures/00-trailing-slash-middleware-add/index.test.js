const path = require('path');
const fs = require('fs-extra');
const { deployAndTest, waitFor } = require('../../utils');

describe(`${__dirname.split(path.sep).pop()}`, () => {
  let ctx = {
    deploymentUrl: '',
    deploymentId: '',
  };
  const sourcePath = path.join(__dirname, '../00-trailing-slash-add');
  const outputPath = path.join(__dirname, 'temp');

  afterAll(async () => {
    await fs.remove(outputPath);
  });

  it('should deploy and pass probe checks', async () => {
    await fs.copy(sourcePath, outputPath);
    await fs.writeFile(
      path.join(outputPath, 'middleware.js'),
      `
      export default function middleware() {
        // no-op middleware to trigger next data resolving routes
      }
      `
    );
    ctx = await deployAndTest(outputPath);
  });

  it('should have correct content after revalidating for /', async () => {
    let prevNow = null;

    // request _next/data until we get the revalidated content
    for (let i = 0; i < 10; i++) {
      const dataRes = await fetch(
        `${ctx.deploymentUrl}/_next/data/build-TfctsWXpff2fKS/index.json`
      );
      expect(dataRes.status).toBe(200);
      const data = await dataRes.json();

      expect(data.pageProps.now).toBeTruthy();
      expect(dataRes.headers.get('content-type')).toContain('application/json');

      if (prevNow && prevNow !== data.pageProps.now) {
        break;
      }
      prevNow = data.pageProps.now;
      await waitFor(250);
    }

    // ensure the HTML response is actually HTML after revalidating
    // via the _next/data endpoint
    const htmlRes = await fetch(ctx.deploymentUrl);
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.headers.get('content-type')).toContain('text/html');

    const html = await htmlRes.text();
    expect(html).toContain('<html');
  });
});
