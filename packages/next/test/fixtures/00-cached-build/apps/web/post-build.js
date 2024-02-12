const fs = require('fs');
const path = require('path');

const requiredFilesManifestPath = path.join(
  __dirname,
  '.next/required-server-files.json'
);

const requiredFilesManifest = JSON.parse(
  fs.readFileSync(requiredFilesManifestPath, 'utf8')
);

fs.writeFileSync(
  requiredFilesManifestPath,
  JSON.stringify({
    ...requiredFilesManifest,
    appDir: '/non-existent/apps/web',
  })
);
