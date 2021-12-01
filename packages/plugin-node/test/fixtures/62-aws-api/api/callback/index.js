const { say } = require('cowsay');

export const config = {
  awsHandlerName: 'handler',
};

exports.handler = function (event, context, callback) {
  const data = {
    statusCode: 200,
    headers: {},
    body: say({ text: 'aws-api-callback' }),
  };
  callback(null, data);
};
