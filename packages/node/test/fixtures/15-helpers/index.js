/* eslint-disable prefer-destructuring */

module.exports = (req, res) => {
  res.status(200);

  let who = 'anonymous';

  if (req.body && req.body.who) {
    who = req.body.who;
  } else if (req.query.who) {
    who = req.query.who;
  } else if (req.cookies.who) {
    who = req.cookies.who;
  }

  res.send(`hello ${who}:RANDOMNESS_PLACEHOLDER`);
};
