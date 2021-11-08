const { json, send } = require('micro');

module.exports = async (req, res) => {
  const body = await json(req);

  let who = 'anonymous';

  if (body && body.who) {
    who = body.who;
  }

  send(res, 200, `hello ${who}`);
};
