const { say } = require('cowsay');

exports.handler = async function () {
  return {
    statusCode: 200,
    headers: {},
    body: say({ text: 'aws-api-root:RANDOMNESS_PLACEHOLDER' }),
  };
};
