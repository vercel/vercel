export default async (_req, res) => {
  return res.end(process.env.ANOTHER_SECRET);
};
