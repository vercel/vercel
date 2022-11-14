const { sleep } = require('./sleep');
const { URL } = require('url');

exports.handler = async function (event, _context) {
  const data = JSON.parse(event.body);

  const url = new URL(data.path, `http://${data.host}`);
  const sleepTime = Number(url.searchParams.get('sleep')) || 0;

  await sleep(sleepTime);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      {
        sleepTime,
        region: process.env.AWS_REGION,
        memory: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
      },
      null,
      2
    ),
  };
};
