module.exports = (_req, res) =>
  res.end(`VERCEL_REGION is ${process.env.VERCEL_REGION}`);
