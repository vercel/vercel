import fs from 'fs';

export const config = {
  runtime: 'node',
  memory: 1024,
};

export default function (req, res) {
  res.end('Hi from Node');
}
