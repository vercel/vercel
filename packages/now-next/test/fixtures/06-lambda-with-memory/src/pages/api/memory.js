import os from 'os';

export default function(req, res) {
  res.end(`${4.5e8 > os.memtotal()}`);
}
