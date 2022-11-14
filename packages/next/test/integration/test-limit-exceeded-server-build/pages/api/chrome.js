/* eslint-disable */
import chrome from 'chrome-aws-lambda';
import fs from 'fs';
import path from 'path';

export default (req, res) => {
  try {
    fs.readdirSync(path.join(process.cwd(), 'public'));
  } catch (_) {}

  res.json({ hello: 'world', chrome: true });
};
