const assert = require('assert');
const { createLambda } = require('@now/build-utils/lambda.js'); // eslint-disable-line import/no-extraneous-dependencies
const fetch = require('node-fetch');
const FileBlob = require('@now/build-utils/file-blob.js'); // eslint-disable-line import/no-extraneous-dependencies
const { getFiles } = require('@now/php-bridge');
const path = require('path');
const rename = require('@now/build-utils/fs/rename.js'); // eslint-disable-line import/no-extraneous-dependencies
const streamToBuffer = require('@now/build-utils/fs/stream-to-buffer.js'); // eslint-disable-line import/no-extraneous-dependencies
const yauzl = require('yauzl');

exports.config = {
  maxLambdaSize: '20mb',
};

async function readReleaseUrl(releaseUrl) {
  const resp = await fetch(releaseUrl);

  if (!resp.ok) {
    throw new Error(
      `Failed to download ${releaseUrl}. Status code is ${resp.status}`,
    );
  }

  return resp.buffer();
}

const prefixRegexp = /^wordpress\//;

function decompressBuffer(buffer, mountpoint) {
  return new Promise((resolve, reject) => {
    const files = {};

    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zipfile) => {
      if (error) {
        reject(error);
        return;
      }

      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        const { fileName } = entry;

        if (/\/$/.test(fileName)) {
          zipfile.readEntry();
          return;
        }

        zipfile.openReadStream(entry, (error2, readStream) => {
          if (error2) {
            reject(error2);
            return;
          }

          streamToBuffer(readStream)
            .then((data) => {
              assert(prefixRegexp.test(fileName), fileName);
              const fileName2 = fileName.replace(prefixRegexp, '');
              const fileName3 = path.join(mountpoint, fileName2);
              files[fileName3] = new FileBlob({ data });
              zipfile.readEntry();
            })
            .catch(reject);
        });
      });

      zipfile.on('end', () => resolve(files));
    });
  });
}

const staticRegexps = [
  /\.css$/,
  /\.gif$/,
  /\.ico$/,
  /\.js$/,
  /\.jpg$/,
  /\.png$/,
  /\.svg$/,
  /\.woff$/,
  /\.woff2$/,
];

exports.build = async ({ files, entrypoint, config }) => {
  if (path.basename(entrypoint) !== 'wp-config.php') {
    throw new Error(
      `Entrypoint file name must be "wp-config.php". Currently it is ${entrypoint}`,
    );
  }

  const { releaseUrl = 'https://wordpress.org/latest.zip' } = config;
  console.log(`downloading release url ${releaseUrl}...`);
  const releaseBuffer = await readReleaseUrl(releaseUrl);
  console.log('decompressing release url...');
  const mountpoint = path.dirname(entrypoint);
  const releaseFiles = await decompressBuffer(releaseBuffer, mountpoint);
  const mergedFiles = { ...releaseFiles, ...files };

  if (config.patchForPersistentConnections) {
    const wpDbPhp = path.join(mountpoint, 'wp-includes/wp-db.php');
    const wpDbPhpBlob = mergedFiles[wpDbPhp];
    wpDbPhpBlob.data = wpDbPhpBlob.data
      .toString()
      .replace(
        /mysqli_real_connect\( \$this->dbh, \$host,/g,
        "mysqli_real_connect( $this->dbh, 'p:' . $host,",
      );
  }

  const staticFiles = {};
  // eslint-disable-next-line no-restricted-syntax
  for (const [k, v] of Object.entries(mergedFiles)) {
    if (staticRegexps.some(r => r.test(k))) {
      staticFiles[k] = v;
    }
  }

  // move all code to 'user' subdirectory
  const userFiles = rename(mergedFiles, name => path.join('user', name));
  const bridgeFiles = await getFiles();

  const lambda = await createLambda({
    files: { ...userFiles, ...bridgeFiles },
    handler: 'launcher.launcher',
    runtime: 'nodejs8.10',
  });

  const indexPhp = path.join(mountpoint, 'index.php');
  return { ...staticFiles, ...{ [indexPhp]: lambda } };
};
