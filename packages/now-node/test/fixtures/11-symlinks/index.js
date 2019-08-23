import fs from 'fs';

export default function handler(req, res) {
  res.end(fs.readFileSync(`${__dirname}/symlink`));
}
