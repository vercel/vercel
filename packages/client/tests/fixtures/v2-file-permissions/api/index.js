const { readFileSync } = require('fs');
const { join } = require('path');
const { execFile } = require('child_process');
const scriptPath = join(__dirname, '..', 'script.sh');
const scriptContents = readFileSync(scriptPath, 'utf8');

export default function handler(_, res) {
  console.log(
    scriptContents ? 'Found the script' : 'Could not find the script'
  );
  execFile(scriptPath, (err, stdout, stderr) => {
    if (err) {
      res.end('Error: ' + err.message);
    } else if (stdout) {
      res.end(stdout);
    } else if (stderr) {
      res.end(stderr);
    }
  });
}
