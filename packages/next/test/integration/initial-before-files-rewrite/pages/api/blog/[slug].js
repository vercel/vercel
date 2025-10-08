export default (req, res) => {
  res.json({
    query: req.query,
    page: 'api/blog/[slug].js',
    random: Math.random(),
    memory: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
  });
};
