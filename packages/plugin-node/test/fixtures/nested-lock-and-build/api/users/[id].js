const cowsay = require('cowsay');
const { date } = require('./.date');

module.exports = (req, res) => {
  res.setHeader('x-date', date);
  res.end(
    cowsay.say({
      text: 'Hello from /api/users/[id].js',
    })
  );
};
