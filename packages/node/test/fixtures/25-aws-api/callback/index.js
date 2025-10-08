const { say } = require('cowsay');

exports.handler = function (event, context, callback) {
  const data = {
    statusCode: 200,
    headers: {},
    body: say({ text: 'aws-api-callback:RANDOMNESS_PLACEHOLDER' }),
  };
  callback(null, data);
};
