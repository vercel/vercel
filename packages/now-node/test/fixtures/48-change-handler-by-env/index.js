module.exports = () => {
  return {
    statusCode: 200,
    headers: {},
    body: 'default handler',
  };
};

exports.myCustomHandler = async function() {
  return {
    statusCode: 200,
    headers: {},
    body: 'custom handler',
  };
};
