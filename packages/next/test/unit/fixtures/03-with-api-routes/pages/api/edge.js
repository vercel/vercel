export const config = {
  runtime: 'edge',
};

export default async function Edge(req, res) {
  res.json({ edge: 1 });
}
