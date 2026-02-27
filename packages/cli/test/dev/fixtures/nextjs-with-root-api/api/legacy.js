// Root api/ file so zero-config would add catch-all /api 404 for non-Next.
// With CLI-152 fix we do not add that for Next.js, so app/api/posts/[id] works.
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).end(JSON.stringify({ source: 'legacy-api' }));
};
