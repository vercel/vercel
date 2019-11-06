import os from 'os';

export default function(req, res) {
  res.end(`${2e8 > os.memtotal()}`);
}
