const { sleep } = require('./sleep');
const { URL } = require('url');

module.exports = async function (req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sleepTime = Number(url.searchParams.get('sleep')) || 0;

  await sleep(sleepTime);

  res.setHeader('Content-Type', 'application/json');

  res.end(
    JSON.stringify(
      {
        sleepTime,
        region: process.env.AWS_REGION,
        memory: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
      },
      null,
      2
    )
  );
};
