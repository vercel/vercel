import firebase from 'firebase';
import path from 'path';
import fs from 'fs';

export default (req, res) => {
  try {
    fs.readdirSync(path.join(process.cwd(), 'public'));
  } catch (_) {}

  res.json({ hello: 'world', firebase: true });
};
