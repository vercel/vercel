const { say } = require('cowsay');

export const config = {
  awsHandlerName: 'handler',
};

exports.handler = async function () {
  return {
    statusCode: 200,
    headers: {},
    body: say({ text: 'aws-api-root' }),
  };
};
