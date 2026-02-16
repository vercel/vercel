const path = require('path');
const { deployAndTest, waitFor } = require('../../utils');

describe(`${__dirname.split(path.sep).pop()}`, () => {
  let ctx = {
    deploymentUrl: '',
    deploymentId: '',
  };
  it('should deploy and pass probe checks', async () => {
    ctx = await deployAndTest(__dirname);
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
