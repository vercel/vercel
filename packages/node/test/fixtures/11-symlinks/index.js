import fs from 'fs';

export default function (req, res) {
  const path = `${__dirname}/symlink`;
  const data = fs.readFileSync(path, 'utf8');
  const isSymlink = fs.lstatSync(path).isSymbolicLink();
  const target = fs.readlinkSync(path);
  res.json({ path, target, isSymlink, data });
}
