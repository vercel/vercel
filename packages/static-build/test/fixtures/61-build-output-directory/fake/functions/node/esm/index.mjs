import { hello } from './other.mjs';

export default async (_req, res) => {
  return res.end(hello);
};
