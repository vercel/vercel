import chrome from 'chrome-aws-lambda';

export default (req, res) => {
  res.json({ hello: 'world', chrome: true });
};
